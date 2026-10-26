import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  NotificationType,
  Prisma,
  TaskReminderStatus,
  TaskReminderType,
  TaskStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { QueuesService } from '../queues/queues.service.js';

@Injectable()
export class TaskReminderSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TaskReminderSchedulerService.name);
  private readonly scanIntervalMs = 5 * 60 * 1000;
  private readonly enqueueClaimTimeoutMs = 10 * 60 * 1000;
  private readonly batchSize = 250;

  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueuesService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.scan().catch((error: unknown) => {
        this.logger.error('Reminder scan failed', error);
      });
    }, this.scanIntervalMs);

    this.timer.unref();

    void this.scan().catch((error: unknown) => {
      this.logger.error('Initial reminder scan failed', error);
    });

    this.logger.log('Deadline reminder scheduler started; interval=5m');
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async scan(now = new Date()): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      // Recover claims left behind if the process crashed after claiming
      // a reminder but before finalizing its queued state in the database.
      await this.recoverStaleEnqueueClaims(now);

      await this.scanWindow(
        now,
        TaskReminderType.DUE_24_HOURS,
        24 * 60 * 60 * 1000,
      );

      await this.scanWindow(
        now,
        TaskReminderType.DUE_1_HOUR,
        60 * 60 * 1000,
      );
    } finally {
      this.running = false;
    }
  }

  /**
   * Recover stale enqueue claims only when Redis confirms that the
   * deterministic email job still exists in a waiting/delayed state.
   *
   * Missing, active, completed, and failed jobs are deliberately not
   * automatically re-enqueued here. Those cases need reconciliation
   * rather than a potentially duplicate email.
   */
  private async recoverStaleEnqueueClaims(now: Date): Promise<void> {
    const staleBefore = new Date(
      now.getTime() - this.enqueueClaimTimeoutMs,
    );

    let lastId: string | undefined;

    while (true) {
      const reminders = await this.prisma.taskReminder.findMany({
        where: {
          ...(lastId ? { id: { gt: lastId } } : {}),
          status: {
            in: [
              TaskReminderStatus.PENDING,
              TaskReminderStatus.QUEUED,
            ],
          },
          emailEnqueueClaimedAt: {
            lt: staleBefore,
          },
          emailQueuedAt: null,
          emailSentAt: null,
        },
        select: {
          id: true,
          status: true,
          emailEnqueueClaimedAt: true,
        },
        orderBy: {
          id: 'asc',
        },
        take: this.batchSize,
      });

      if (reminders.length === 0) {
        break;
      }

      for (const reminder of reminders) {
        const claimedAt = reminder.emailEnqueueClaimedAt;

        if (!claimedAt) {
          continue;
        }

        try {
          const jobState = await this.queues.getEmailJobState(
            `deadline-${reminder.id}`,
          );

          if (jobState !== 'waiting' && jobState !== 'delayed') {
            if (jobState === 'active') {
              this.logger.debug(
                `Stale enqueue claim retained because email job is active; reminder=${reminder.id}`,
              );
            } else {
              this.logger.warn(
                `Stale enqueue claim needs reconciliation; reminder=${reminder.id}, jobState=${jobState ?? 'missing'}`,
              );
            }

            continue;
          }

          // Compare-and-set protects against another scheduler or worker
          // changing this reminder while we inspect its Redis job.
          const recovered = await this.prisma.taskReminder.updateMany({
            where: {
              id: reminder.id,
              status: {
                in: [
                  TaskReminderStatus.PENDING,
                  TaskReminderStatus.QUEUED,
                ],
              },
              emailEnqueueClaimedAt: claimedAt,
              emailQueuedAt: null,
              emailSentAt: null,
            },
            data: {
              status: TaskReminderStatus.QUEUED,
              emailQueuedAt: now,
              emailEnqueueClaimedAt: null,
              lastError: null,
            },
          });

          if (recovered.count === 1) {
            this.logger.warn(
              `Recovered stale enqueue claim; reminder=${reminder.id}, jobState=${jobState}`,
            );
          }
        } catch (error) {
          // A temporary Redis/database failure must not make us enqueue
          // another job without knowing the state of the existing one.
          this.logger.error(
            `Failed to recover stale enqueue claim; reminder=${reminder.id}`,
            error,
          );
        }
      }

      if (reminders.length < this.batchSize) {
        break;
      }

      lastId = reminders[reminders.length - 1]!.id;
    }
  }

  private async scanWindow(
    now: Date,
    type: TaskReminderType,
    offsetMs: number,
  ): Promise<void> {
    const target = new Date(now.getTime() + offsetMs);
    const windowMs = 5 * 60 * 1000;
    let lastId: string | undefined;

    while (true) {
      const tasks = await this.prisma.task.findMany({
        where: {
          ...(lastId ? { id: { gt: lastId } } : {}),
          dueDate: {
            gte: new Date(target.getTime() - windowMs),
            lte: new Date(target.getTime() + windowMs),
          },
          assigneeId: { not: null },
          status: { not: TaskStatus.DONE },
        },
        select: {
          id: true,
          organizationId: true,
          title: true,
          dueDate: true,
          assigneeId: true,
          status: true,
          assignee: {
            select: {
              orgMember: {
                select: {
                  user: {
                    select: {
                      email: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { id: 'asc' },
        take: this.batchSize,
      });

      for (const task of tasks) {
        if (
          !task.dueDate ||
          !task.assigneeId ||
          !task.assignee?.orgMember.user.email
        ) {
          continue;
        }

        try {
          await this.processTask(task, type, now);
        } catch (error) {
          this.logger.error(
            `Reminder failed for task=${task.id} type=${type}`,
            error,
          );
        }
      }

      if (tasks.length < this.batchSize) {
        break;
      }

      lastId = tasks[tasks.length - 1]!.id;
    }
  }

  private async processTask(
    task: {
      id: string;
      organizationId: string;
      title: string;
      dueDate: Date | null;
      assigneeId: string | null;
      status: TaskStatus;
      assignee: {
        orgMember: {
          user: {
            email: string;
            name: string;
          };
        };
      } | null;
    },
    type: TaskReminderType,
    now: Date,
  ): Promise<void> {
    const dueDate = task.dueDate;
    const recipientId = task.assigneeId;
    const email = task.assignee?.orgMember.user.email;

    if (!dueDate || !recipientId || !email) {
      return;
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const current = await tx.task.findFirst({
          where: {
            id: task.id,
            organizationId: task.organizationId,
            dueDate,
            assigneeId: recipientId,
            status: { not: TaskStatus.DONE },
          },
          select: {
            id: true,
            title: true,
          },
        });

        if (!current) {
          return;
        }

        const reminder = await tx.taskReminder.upsert({
          where: {
            taskId_dueDate_recipientId_type: {
              taskId: task.id,
              dueDate,
              recipientId,
              type,
            },
          },
          create: {
            taskId: task.id,
            organizationId: task.organizationId,
            recipientId,
            type,
            dueDate,
            status: TaskReminderStatus.PENDING,
          },
          update: {},
        });

        // Never recreate notifications or overwrite active/terminal states.
        if (
          reminder.notificationAt ||
          reminder.status === TaskReminderStatus.PROCESSING ||
          reminder.status === TaskReminderStatus.SENT ||
          reminder.status === TaskReminderStatus.SKIPPED
        ) {
          return;
        }

        await tx.notification.create({
          data: {
            taskReminderId: reminder.id,
            organizationId: task.organizationId,
            recipientId,
            taskId: task.id,
            type: NotificationType.TASK_DEADLINE_REMINDER,
            message:
              type === TaskReminderType.DUE_24_HOURS
                ? `Task "${current.title}" is due in about 24 hours.`
                : `Task "${current.title}" is due in about 1 hour.`,
          },
        });

        await tx.taskReminder.update({
          where: { id: reminder.id },
          data: {
            notificationAt: now,
            lastError: null,
          },
        });
      });
    } catch (error) {
      // Another scheduler may have created the unique notification first.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.debug(
          `Reminder notification already exists for task=${task.id} type=${type}`,
        );
      } else {
        throw error;
      }
    }

    const reminder = await this.prisma.taskReminder.findUnique({
      where: {
        taskId_dueDate_recipientId_type: {
          taskId: task.id,
          dueDate,
          recipientId,
          type,
        },
      },
    });

    if (
      !reminder ||
      reminder.emailSentAt ||
      reminder.emailQueuedAt ||
      reminder.emailEnqueueClaimedAt ||
      reminder.status === TaskReminderStatus.PROCESSING ||
      reminder.status === TaskReminderStatus.SENT ||
      reminder.status === TaskReminderStatus.SKIPPED
    ) {
      return;
    }

    const current = await this.prisma.task.findFirst({
      where: {
        id: task.id,
        organizationId: task.organizationId,
        dueDate,
        assigneeId: recipientId,
        status: { not: TaskStatus.DONE },
      },
      select: { id: true },
    });

    if (!current) {
      await this.prisma.taskReminder.updateMany({
        where: {
          id: reminder.id,
          status: {
            in: [
              TaskReminderStatus.PENDING,
              TaskReminderStatus.QUEUED,
            ],
          },
          emailSentAt: null,
          emailQueuedAt: null,
          emailEnqueueClaimedAt: null,
        },
        data: {
          status: TaskReminderStatus.SKIPPED,
          lastError: 'Task changed before email enqueue',
        },
      });

      return;
    }

    // Atomic claim prevents concurrent scheduler instances from enqueueing
    // the same reminder.
    const claimAt = new Date();

    const claim = await this.prisma.taskReminder.updateMany({
      where: {
        id: reminder.id,
        status: {
          in: [
            TaskReminderStatus.PENDING,
            TaskReminderStatus.QUEUED,
          ],
        },
        emailSentAt: null,
        emailQueuedAt: null,
        emailEnqueueClaimedAt: null,
      },
      data: {
        emailEnqueueClaimedAt: claimAt,
      },
    });

    if (claim.count !== 1) {
      return;
    }

    const taskStillCurrent = await this.prisma.task.findFirst({
      where: {
        id: task.id,
        organizationId: task.organizationId,
        dueDate,
        assigneeId: recipientId,
        status: { not: TaskStatus.DONE },
      },
      select: { id: true },
    });

    if (!taskStillCurrent) {
      await this.prisma.taskReminder.updateMany({
        where: {
          id: reminder.id,
          emailEnqueueClaimedAt: claimAt,
          emailQueuedAt: null,
          emailSentAt: null,
        },
        data: {
          status: TaskReminderStatus.SKIPPED,
          emailEnqueueClaimedAt: null,
          lastError: 'Task changed before email enqueue',
        },
      });

      return;
    }

    try {
      await this.queues.enqueueEmail({
        to: email,
        subject:
          type === TaskReminderType.DUE_24_HOURS
            ? `Task due in 24 hours: ${task.title}`
            : `Task due in 1 hour: ${task.title}`,
        text: `Hello ${task.assignee?.orgMember.user.name ?? ''},\n\nYour task "${task.title}" is due at ${dueDate.toISOString()}.\n\nPlease open TaskForge to review it.`,
        idempotencyKey: `deadline-${reminder.id}`,
        reminderId: reminder.id,
      });
    } catch (error) {
      await this.prisma.taskReminder.updateMany({
        where: {
          id: reminder.id,
          emailEnqueueClaimedAt: claimAt,
          emailQueuedAt: null,
          emailSentAt: null,
        },
        data: {
          emailEnqueueClaimedAt: null,
          lastError:
            error instanceof Error
              ? error.message
              : 'Email enqueue failed',
        },
      });

      throw error;
    }

    // Redis may have accepted the job even if this process crashes before
    // this DB update. The recovery scan checks the deterministic job ID.
    const finalized = await this.prisma.taskReminder.updateMany({
      where: {
        id: reminder.id,
        emailEnqueueClaimedAt: claimAt,
        emailQueuedAt: null,
        emailSentAt: null,
      },
      data: {
        emailQueuedAt: now,
        status: TaskReminderStatus.QUEUED,
        emailEnqueueClaimedAt: null,
        lastError: null,
      },
    });

    if (finalized.count !== 1) {
      this.logger.error(
        `Email job enqueued but reminder state was not finalized; reminder=${reminder.id}. Manual reconciliation may be required.`,
      );
    }
  }
}