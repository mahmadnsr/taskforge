import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  EmailJobPayload,
  TestJobPayload,
  TaskEventPayload,
} from './queues.service.js';

@Processor('taskforge')
export class QueuesProcessor extends WorkerHost {
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

        // Deliberately do not claim to send email until a real provider
        // (SMTP/API) is configured. Throwing makes BullMQ retry the job.
        throw new Error(
          `Email provider is not configured; cannot send to ${data.to}`,
        );
      }

      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  }
}
