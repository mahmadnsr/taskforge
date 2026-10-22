import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NotificationType, TaskReminderStatus, TaskReminderType, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { QueuesService } from '../queues/queues.service.js';

@Injectable()
export class TaskReminderSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TaskReminderSchedulerService.name);
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
    }, 5 * 60 * 1000);

    this.timer.unref();
    void this.scan().catch((error: unknown) => {
      this.logger.error('Initial reminder scan failed', error);
    });
    this.logger.log('Deadline reminder scheduler started; interval=5m');
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async scan(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      await this.scanWindow(now, TaskReminderType.DUE_24_HOURS, 24 * 60 * 60 * 1000);
      await this.scanWindow(now, TaskReminderType.DUE_1_HOUR, 60 * 60 * 1000);
    } finally {
      this.running = false;
    }
  }

  private async scanWindow(now: Date, type: TaskReminderType, offsetMs: number) {
    const target = new Date(now.getTime() + offsetMs);
    const windowMs = 5 * 60 * 1000;

    const tasks = await this.prisma.task.findMany({
      where: {
        dueDate: { gte: new Date(target.getTime() - windowMs), lte: new Date(target.getTime() + windowMs) },
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
                user: { select: { email: true, name: true } },
              },
            },
          },
        },
      },
      take: 250,
    });

    for (const task of tasks) {
      if (!task.dueDate || !task.assigneeId || !task.assignee?.orgMember.user.email) continue;

      try {
        await this.processTask(task, type, now);
      } catch (error) {
        this.logger.error(`Reminder failed for task=${task.id} type=${type}`, error);
      }
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
      assignee: { orgMember: { user: { email: string; name: string } } } | null;
    },
    type: TaskReminderType,
    now: Date,
  ) {
    const dueDate = task.dueDate;
    const recipientId = task.assigneeId;
    const email = task.assignee?.orgMember.user.email;

    if (!dueDate || !recipientId || !email) return;

    await this.prisma.$transaction(async (tx) => {
      const current = await tx.task.findFirst({
        where: {
          id: task.id,
          organizationId: task.organizationId,
          dueDate,
          assigneeId: recipientId,
          status: { not: TaskStatus.DONE },
        },
        select: { id: true, title: true },
      });

      if (!current) return;

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

      if (reminder.notificationAt || reminder.status === TaskReminderStatus.SKIPPED) return;

      await tx.notification.create({
        data: {
          organizationId: task.organizationId,
          recipientId,
          taskId: task.id,
          type: NotificationType.TASK_DEADLINE_REMINDER,
          message: type === TaskReminderType.DUE_24_HOURS
            ? `Task "${current.title}" is due in about 24 hours.`
            : `Task "${current.title}" is due in about 1 hour.`,
        },
      });

      await tx.taskReminder.update({
        where: { id: reminder.id },
        data: { notificationAt: now, status: TaskReminderStatus.PENDING, lastError: null },
      });
    });

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

    if (!reminder || reminder.emailSentAt || reminder.emailQueuedAt || reminder.status === TaskReminderStatus.SENT || reminder.status === TaskReminderStatus.SKIPPED) return;

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
      await this.prisma.taskReminder.update({
        where: { id: reminder.id },
        data: { status: TaskReminderStatus.SKIPPED, lastError: 'Task changed before email enqueue' },
      });
      return;
    }

    try {
      await this.queues.enqueueEmail({
        to: email,
        subject: type === TaskReminderType.DUE_24_HOURS
          ? `Task due in 24 hours: ${task.title}`
          : `Task due in 1 hour: ${task.title}`,
        text: `Hello ${task.assignee?.orgMember.user.name ?? ''},\\n\\nYour task "${task.title}" is due at ${dueDate.toISOString()}.\\n\\nPlease open TaskForge to review it.`,
        idempotencyKey: `deadline-${reminder.id}`,
        reminderId: reminder.id,
      });

      await this.prisma.taskReminder.update({
        where: { id: reminder.id },
        data: {
          emailQueuedAt: now,
          status: TaskReminderStatus.QUEUED,
          lastError: null,
        },
      });
    } catch (error) {
      await this.prisma.taskReminder.update({
        where: { id: reminder.id },
        data: {
          lastError: error instanceof Error ? error.message : 'Email enqueue failed',
        },
      });
      throw error;
    }
  }
}
