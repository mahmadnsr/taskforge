import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { TaskReminderStatus, TaskStatus } from '@prisma/client';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  EmailJobPayload,
  TestJobPayload,
  TaskEventPayload,
} from './queues.service.js';

@Processor('taskforge')
@Injectable()
export class QueuesProcessor extends WorkerHost {
  private readonly logger = new Logger(QueuesProcessor.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(
    job: Job<TestJobPayload | EmailJobPayload | TaskEventPayload>,
  ): Promise<void> {
    switch (job.name) {
      case 'test-job': {
        const data = job.data as TestJobPayload;

        console.log(
          `[TaskForge Worker] Processed job=${job.id} message=${data.message}`,
        );

        return;
      }

      case 'task-event': {
        const data = job.data as TaskEventPayload;

        console.log(
          `[TaskForge Worker] Task event=${data.eventType} job=${job.id} task=${data.taskId} organization=${data.organizationId}`,
        );

        return;
      }

      case 'send-email': {
        const data = job.data as EmailJobPayload;
        let claimAt: Date | undefined;

        if (data.reminderId) {
          // Read only the fields needed before attempting the atomic claim.
          const reminder = await this.prisma.taskReminder.findUnique({
            where: { id: data.reminderId },
            select: {
              id: true,
              status: true,
              emailSentAt: true,
            },
          });

          if (!reminder) {
            this.logger.warn(`Reminder not found: ${data.reminderId}`);
            return;
          }

          if (
            reminder.emailSentAt ||
            reminder.status === TaskReminderStatus.SENT
          ) {
            this.logger.log(`Reminder already sent: ${reminder.id}`);
            return;
          }

          // Do not process reminders that are already being processed or
          // have been skipped. Only one worker can win this atomic claim.
          claimAt = new Date();

          const claim = await this.prisma.taskReminder.updateMany({
            where: {
              id: reminder.id,
              emailSentAt: null,
              status: {
                in: [
                  TaskReminderStatus.PENDING,
                  TaskReminderStatus.QUEUED,
                ],
              },
            },
            data: {
              status: TaskReminderStatus.PROCESSING,
              emailProcessingAt: claimAt,
              lastError: null,
            },
          });

          if (claim.count !== 1) {
            this.logger.log(
              `Reminder claim not acquired; another worker may be processing it: ${reminder.id}`,
            );
            return;
          }

          // This token ensures that subsequent updates only affect the
          // worker that successfully claimed this reminder.
          let claimedReminder;

          try {
            claimedReminder = await this.prisma.taskReminder.findUnique({
              where: { id: reminder.id },
              include: {
                task: {
                  select: {
                    organizationId: true,
                    dueDate: true,
                    assigneeId: true,
                    status: true,
                    deletedAt: true,
                  },
                },
                recipient: {
                  select: { email: true },
                },
              },
            });
          } catch (error) {
            // No email attempt has been made, so release the claim and let
            // BullMQ retry if the database read fails.
            await this.releaseReminderClaim(reminder.id, claimAt, error);
            throw error;
          }

          if (!claimedReminder) {
            this.logger.warn(
              `Claimed reminder disappeared before delivery: ${reminder.id}`,
            );
            return;
          }

          const taskIsCurrent =
            claimedReminder.status === TaskReminderStatus.PROCESSING &&
            claimedReminder.emailProcessingAt?.getTime() ===
              claimAt.getTime() &&
            claimedReminder.task.organizationId ===
              claimedReminder.organizationId &&
            claimedReminder.task.dueDate?.getTime() ===
              claimedReminder.dueDate.getTime() &&
            claimedReminder.task.assigneeId ===
              claimedReminder.recipientId &&
            claimedReminder.task.status !== TaskStatus.DONE &&
            claimedReminder.task.deletedAt === null &&
            claimedReminder.recipient.email === data.to;

          if (!taskIsCurrent) {
            try {
              const skipped = await this.prisma.taskReminder.updateMany({
                where: {
                  id: reminder.id,
                  status: TaskReminderStatus.PROCESSING,
                  emailProcessingAt: claimAt,
                  emailSentAt: null,
                },
                data: {
                  status: TaskReminderStatus.SKIPPED,
                  emailProcessingAt: null,
                  lastError:
                    'Task changed or reminder became stale before email delivery',
                },
              });

              if (skipped.count === 1) {
                this.logger.log(`Skipped stale reminder: ${reminder.id}`);
              } else {
                this.logger.warn(
                  `Could not mark reminder as skipped because its claim changed: ${reminder.id}`,
                );
              }
            } catch (error) {
              // The email has not been attempted. Release the claim so
              // BullMQ can retry the validation and status update.
              await this.releaseReminderClaim(reminder.id, claimAt, error);
              throw error;
            }

            return;
          }
        }

        // For reminder emails, the atomic claim prevents concurrent workers
        // from sending the same reminder at the same time. Normal emails
        // without a reminderId retain their existing behavior.
        try {
          await this.emailService.send({
            to: data.to,
            subject: data.subject,
            text: data.text,
          });
        } catch (error) {
          if (data.reminderId && claimAt) {
            const message =
              error instanceof Error ? error.message : 'Email delivery outcome unknown';

            // SMTP errors can be ambiguous: the provider may have accepted
            // the email even if the connection failed before confirmation.
            // Keep the claim so BullMQ cannot automatically resend it.
            try {
              await this.prisma.taskReminder.updateMany({
                where: {
                  id: data.reminderId,
                  status: TaskReminderStatus.PROCESSING,
                  emailProcessingAt: claimAt,
                  emailSentAt: null,
                },
                data: {
                  lastError: `Delivery outcome uncertain: ${message}`,
                },
              });
            } catch (recordError) {
              this.logger.error(
                `Could not record uncertain email outcome. Automatic retry suppressed. reminder=${data.reminderId} job=${job.id}`,
                recordError instanceof Error ? recordError.stack : undefined,
              );
            }

            this.logger.error(
              `Email delivery outcome uncertain. Automatic retry suppressed. reminder=${data.reminderId} job=${job.id}`,
              error instanceof Error ? error.stack : undefined,
            );

            return;
          }

          // Preserve retry behaviour for ordinary emails without reminders.
          throw error;
        }

        // SMTP accepted the email. Record the result using the claim token.
        // If this database write fails, suppress automatic retry to reduce
        // duplicate-email risk.
        if (data.reminderId && claimAt) {
          const sentAt = new Date();

          try {
            const result = await this.prisma.taskReminder.updateMany({
              where: {
                id: data.reminderId,
                status: TaskReminderStatus.PROCESSING,
                emailProcessingAt: claimAt,
                emailSentAt: null,
              },
              data: {
                emailSentAt: sentAt,
                sentAt,
                status: TaskReminderStatus.SENT,
                emailProcessingAt: null,
                lastError: null,
              },
            });

            if (result.count !== 1) {
              this.logger.error(
                `Email was accepted, but reminder success was not recorded. ` +
                  `Automatic retry suppressed. reminder=${data.reminderId} job=${job.id}`,
              );
              return;
            }
          } catch (error) {
            this.logger.error(
              `Email send succeeded but reminder status update failed. ` +
                `Automatic retry suppressed to reduce duplicate-email risk. ` +
                `reminder=${data.reminderId} job=${job.id}`,
              error instanceof Error ? error.stack : undefined,
            );

            return;
          }
        }

        this.logger.log(`Email sent successfully. job=${job.id}`);

        return;
      }

      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  }

  private async releaseReminderClaim(
    reminderId: string,
    claimAt: Date,
    cause: unknown,
  ): Promise<void> {
    try {
      const result = await this.prisma.taskReminder.updateMany({
        where: {
          id: reminderId,
          status: TaskReminderStatus.PROCESSING,
          emailProcessingAt: claimAt,
          emailSentAt: null,
        },
        data: {
          status: TaskReminderStatus.QUEUED,
          emailProcessingAt: null,
          lastError:
            cause instanceof Error ? cause.message : 'Email processing failed',
        },
      });

      if (result.count !== 1) {
        this.logger.warn(
          `Reminder claim could not be released because its state changed: ${reminderId}`,
        );
      }
    } catch (releaseError) {
      this.logger.error(
        `Failed to release reminder claim: ${reminderId}`,
        releaseError instanceof Error ? releaseError.stack : undefined,
      );
    }
  }
}
