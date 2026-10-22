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

        if (data.reminderId) {
          const reminder = await this.prisma.taskReminder.findUnique({
            where: { id: data.reminderId },
            include: {
              task: {
                select: {
                  organizationId: true,
                  dueDate: true,
                  assigneeId: true,
                  status: true,
                },
              },
              recipient: { select: { email: true } },
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

          const taskIsCurrent =
            reminder.status !== TaskReminderStatus.SKIPPED &&
            reminder.task.organizationId === reminder.organizationId &&
            reminder.task.dueDate?.getTime() === reminder.dueDate.getTime() &&
            reminder.task.assigneeId === reminder.recipientId &&
            reminder.task.status !== TaskStatus.DONE &&
            reminder.recipient.email === data.to;

          if (!taskIsCurrent) {
            await this.prisma.taskReminder.update({
              where: { id: reminder.id },
              data: {
                status: TaskReminderStatus.SKIPPED,
                lastError: 'Task changed or reminder became stale before email delivery',
              },
            });
            this.logger.log(`Skipped stale reminder: ${reminder.id}`);
            return;
          }
        }

        await this.emailService.send({
          to: data.to,
          subject: data.subject,
          text: data.text,
        });

        if (data.reminderId) {
          const sentAt = new Date();
          await this.prisma.taskReminder.update({
            where: { id: data.reminderId },
            data: {
              emailSentAt: sentAt,
              sentAt,
              status: TaskReminderStatus.SENT,
              lastError: null,
            },
          });
        }

        console.log(
          `[TaskForge Worker] Email sent job=${job.id} to=${data.to}`,
        );
        return;
      }

      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  }
}
