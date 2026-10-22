import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, JobsOptions, Queue } from 'bullmq';

export interface TestJobPayload {
  message: string;
}

export interface TaskEventPayload {
  eventId: string;
  organizationId: string;
  taskId: string;
  actorId: string;
  eventType: 'TASK_CREATED' | 'TASK_ASSIGNED' | 'TASK_STATUS_CHANGED';
  occurredAt: string;
}

export interface EmailJobPayload {
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
  reminderId?: string;
}

@Injectable()
export class QueuesService {
  constructor(
    @InjectQueue('taskforge')
    private readonly queue: Queue,
  ) {}

  async addTestJob(
    message: string,
    options: JobsOptions = {},
  ): Promise<Job<TestJobPayload>> {
    return this.queue.add(
      'test-job',
      { message },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 500,
        ...options,
      },
    );
  }

  async enqueueTaskEvent(
    input: TaskEventPayload,
  ): Promise<Job<TaskEventPayload>> {
    if (!input.eventId.trim()) {
      throw new Error('Task event eventId must not be empty');
    }

    return this.queue.add('task-event', input, {
      jobId: `task-event-${input.eventId}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 500,
      removeOnFail: 1000,
    });
  }

  async enqueueEmail(
    input: EmailJobPayload,
  ): Promise<Job<EmailJobPayload>> {
    const { idempotencyKey } = input;

    if (!idempotencyKey.trim()) {
      throw new Error('Email idempotencyKey must not be empty');
    }

    return this.queue.add('send-email', input, {
      jobId: `email-${idempotencyKey}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 500,
      removeOnFail: 1000,
    });
  }
}
