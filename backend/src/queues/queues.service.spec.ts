import { describe, expect, it, vi } from 'vitest';
import { QueuesService } from './queues.service.js';

describe('QueuesService', () => {
  it('adds a test job with retry and backoff defaults', async () => {
    const add = vi.fn().mockResolvedValue({ id: 'job-1' });
    const service = new QueuesService({ add } as never);

    await service.addTestJob('hello');

    expect(add).toHaveBeenCalledWith(
      'test-job',
      { message: 'hello' },
      expect.objectContaining({
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      }),
    );
  });

  it('allows overriding test job options', async () => {
    const add = vi.fn().mockResolvedValue({ id: 'job-2' });
    const service = new QueuesService({ add } as never);

    await service.addTestJob('hello', { jobId: 'custom-id', attempts: 1 });

    expect(add).toHaveBeenCalledWith(
      'test-job',
      { message: 'hello' },
      expect.objectContaining({ jobId: 'custom-id', attempts: 1 }),
    );
  });

  it('enqueues task events with retries and a deterministic job ID', async () => {
    const add = vi.fn().mockResolvedValue({
      id: 'task-event-created-task-1',
    });
    const service = new QueuesService({ add } as never);

    const payload = {
      eventId: 'created-task-1',
      organizationId: 'org-1',
      taskId: 'task-1',
      actorId: 'user-1',
      eventType: 'TASK_CREATED' as const,
      occurredAt: '2026-10-22T00:00:00.000Z',
    };

    await service.enqueueTaskEvent(payload);

    expect(add).toHaveBeenCalledWith(
      'task-event',
      payload,
      expect.objectContaining({
        jobId: 'task-event-created-task-1',
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 500,
        removeOnFail: 1000,
      }),
    );
  });

  it('rejects an empty task event ID', async () => {
    const add = vi.fn();
    const service = new QueuesService({ add } as never);

    await expect(
      service.enqueueTaskEvent({
        eventId: '  ',
        organizationId: 'org-1',
        taskId: 'task-1',
        actorId: 'user-1',
        eventType: 'TASK_CREATED',
        occurredAt: '2026-10-22T00:00:00.000Z',
      }),
    ).rejects.toThrow('Task event eventId must not be empty');

    expect(add).not.toHaveBeenCalled();
  });

  it('enqueues email with retries and deterministic job ID', async () => {
    const add = vi.fn().mockResolvedValue({ id: 'email-welcome-user-1' });
    const service = new QueuesService({ add } as never);

    const payload = {
      to: 'user@example.com',
      subject: 'Welcome',
      text: 'Welcome to TaskForge',
      idempotencyKey: 'welcome-user-1',
    };

    await service.enqueueEmail(payload);

    expect(add).toHaveBeenCalledWith(
      'send-email',
      payload,
      expect.objectContaining({
        jobId: 'email-welcome-user-1',
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 500,
        removeOnFail: 1000,
      }),
    );
  });

  it('rejects an empty email idempotency key', async () => {
    const add = vi.fn();
    const service = new QueuesService({ add } as never);

    await expect(
      service.enqueueEmail({
        to: 'user@example.com',
        subject: 'Hello',
        text: 'Hello',
        idempotencyKey: '  ',
      }),
    ).rejects.toThrow('Email idempotencyKey must not be empty');

    expect(add).not.toHaveBeenCalled();
  });

  it('finds an existing email job by deterministic ID', async () => {
    const job = { id: 'email-deadline-reminder-1' };
    const getJob = vi.fn().mockResolvedValue(job);
    const service = new QueuesService({ getJob } as never);

    await expect(
      service.findEmailJob('deadline-reminder-1'),
    ).resolves.toBe(job);

    expect(getJob).toHaveBeenCalledWith('email-deadline-reminder-1');
  });

  it('returns undefined when the email job does not exist', async () => {
    const getJob = vi.fn().mockResolvedValue(undefined);
    const service = new QueuesService({ getJob } as never);

    await expect(
      service.findEmailJob('deadline-reminder-1'),
    ).resolves.toBeUndefined();

    expect(getJob).toHaveBeenCalledWith('email-deadline-reminder-1');
  });

  it('rejects an empty email idempotency key when looking up a job', async () => {
    const getJob = vi.fn();
    const service = new QueuesService({ getJob } as never);

    await expect(service.findEmailJob('  ')).rejects.toThrow(
      'Email idempotencyKey must not be empty',
    );

    expect(getJob).not.toHaveBeenCalled();
  });

  it('returns the state of an existing email job', async () => {
    const getState = vi.fn().mockResolvedValue('waiting');
    const getJob = vi.fn().mockResolvedValue({ getState });
    const service = new QueuesService({ getJob } as never);

    await expect(
      service.getEmailJobState('deadline-reminder-1'),
    ).resolves.toBe('waiting');

    expect(getJob).toHaveBeenCalledWith('email-deadline-reminder-1');
    expect(getState).toHaveBeenCalledOnce();
  });

  it('returns null when the email job does not exist', async () => {
    const getJob = vi.fn().mockResolvedValue(undefined);
    const service = new QueuesService({ getJob } as never);

    await expect(
      service.getEmailJobState('deadline-reminder-1'),
    ).resolves.toBeNull();
  });

  it('rejects an empty email idempotency key when reading job state', async () => {
    const getJob = vi.fn();
    const service = new QueuesService({ getJob } as never);

    await expect(service.getEmailJobState('  ')).rejects.toThrow(
      'Email idempotencyKey must not be empty',
    );

    expect(getJob).not.toHaveBeenCalled();
  });
});
