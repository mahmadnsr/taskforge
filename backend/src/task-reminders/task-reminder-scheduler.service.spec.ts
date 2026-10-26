import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TaskReminderSchedulerService,
} from './task-reminder-scheduler.service.js';

describe('TaskReminderSchedulerService', () => {
  let service: TaskReminderSchedulerService;

  let prisma: {
    task: {
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
    taskReminder: {
      upsert: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    notification: {
      create: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };

  let queues: {
    enqueueEmail: ReturnType<typeof vi.fn>;
    getEmailJobState: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    prisma = {
      task: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
      },
      taskReminder: {
        upsert: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      notification: {
        create: vi.fn(),
      },
      $transaction: vi.fn(),
    };

    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );

    queues = {
      enqueueEmail: vi.fn().mockResolvedValue({ id: 'email-job-1' }),
      getEmailJobState: vi.fn().mockResolvedValue(null),
    };

    service = new TaskReminderSchedulerService(
      prisma as never,
      queues as never,
    );
  });

  it('scans both the 24-hour and 1-hour reminder windows', async () => {
    const now = new Date('2026-10-25T12:00:00.000Z');

    await service.scan(now);

    expect(prisma.task.findMany).toHaveBeenCalledTimes(2);

    const firstQuery = prisma.task.findMany.mock.calls[0][0];
    const secondQuery = prisma.task.findMany.mock.calls[1][0];

    expect(firstQuery.where.dueDate.gte).toEqual(
      new Date('2026-10-26T11:55:00.000Z'),
    );
    expect(firstQuery.where.dueDate.lte).toEqual(
      new Date('2026-10-26T12:05:00.000Z'),
    );

    expect(secondQuery.where.dueDate.gte).toEqual(
      new Date('2026-10-25T12:55:00.000Z'),
    );
    expect(secondQuery.where.dueDate.lte).toEqual(
      new Date('2026-10-25T13:05:00.000Z'),
    );
  });

  it('does not start another scan while one is already running', async () => {
    let releaseFirstQuery: (() => void) | undefined;

    prisma.task.findMany.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseFirstQuery = () => resolve([]);
        }),
    );

    const firstScan = service.scan(new Date('2026-10-25T12:00:00.000Z'));

    await vi.waitFor(() => {
      expect(releaseFirstQuery).toBeDefined();
    });

    await service.scan(new Date('2026-10-25T12:05:00.000Z'));

    expect(prisma.task.findMany).toHaveBeenCalledTimes(1);

    releaseFirstQuery?.();
    await firstScan;

    expect(prisma.task.findMany).toHaveBeenCalledTimes(2);
  });

  it('limits each database batch to 250 tasks and orders by ID', async () => {
    await service.scan(new Date('2026-10-25T12:00:00.000Z'));

    expect(prisma.task.findMany).toHaveBeenCalledTimes(2);

    for (const [query] of prisma.task.findMany.mock.calls) {
      expect(query.take).toBe(250);
      expect(query.orderBy).toEqual({ id: 'asc' });
      expect(query.where.assigneeId).toEqual({ not: null });
    }
  });

  it('fetches subsequent batches when a reminder window contains more than 250 tasks', async () => {
    const firstBatch = Array.from({ length: 250 }, (_, index) => ({
      id: `task-${String(index).padStart(3, '0')}`,
      dueDate: null,
      assigneeId: null,
      assignee: null,
    }));

    const nextTask = {
      id: 'task-250',
      dueDate: null,
      assigneeId: null,
      assignee: null,
    };

    prisma.task.findMany
      .mockResolvedValueOnce(firstBatch)
      .mockResolvedValueOnce([nextTask])
      .mockResolvedValueOnce([]);

    await service.scan(new Date('2026-10-25T12:00:00.000Z'));

    expect(prisma.task.findMany).toHaveBeenCalledTimes(3);

    const secondBatchQuery = prisma.task.findMany.mock.calls[1][0];

    expect(secondBatchQuery.where.id).toEqual({ gt: 'task-249' });
    expect(secondBatchQuery.orderBy).toEqual({ id: 'asc' });
    expect(secondBatchQuery.take).toBe(250);
  });

  it('does not enqueue an email when the reminder is already processing', async () => {
    const dueDate = new Date('2026-10-26T12:00:00.000Z');

    const task = {
      id: 'task-1',
      organizationId: 'org-1',
      title: 'Finish report',
      dueDate,
      assigneeId: 'user-1',
      status: 'TODO',
      assignee: {
        orgMember: {
          user: {
            id: 'user-1',
            email: 'user@example.com',
            name: 'Test User',
          },
        },
      },
    };

    prisma.task.findMany.mockResolvedValue([task]);

    prisma.taskReminder.upsert.mockResolvedValue({
      id: 'reminder-1',
      notificationAt: new Date('2026-10-25T11:00:00.000Z'),
      status: 'PROCESSING',
    });

    prisma.taskReminder.findUnique.mockResolvedValue({
      id: 'reminder-1',
      status: 'PROCESSING',
      emailSentAt: null,
      emailQueuedAt: null,
    });

    await service.scan(new Date('2026-10-25T12:00:00.000Z'));

    expect(prisma.taskReminder.findUnique).toHaveBeenCalled();
    expect(prisma.task.findFirst).toHaveBeenCalledTimes(2);
    expect(queues.enqueueEmail).not.toHaveBeenCalled();
    expect(prisma.taskReminder.update).not.toHaveBeenCalled();
  });

  it('recovers a stale enqueue claim when the corresponding job is waiting', async () => {
    const now = new Date('2026-10-26T12:00:00.000Z');
    const claimedAt = new Date('2026-10-26T11:40:00.000Z');

    prisma.taskReminder.findMany.mockResolvedValue([
      {
        id: 'reminder-1',
        status: 'PENDING',
        emailEnqueueClaimedAt: claimedAt,
        emailQueuedAt: null,
        emailSentAt: null,
      },
    ]);

    queues.getEmailJobState.mockResolvedValue('waiting');

    await service.scan(now);

    expect(queues.getEmailJobState).toHaveBeenCalledWith(
      'deadline-reminder-1',
    );

    expect(prisma.taskReminder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'reminder-1',
          emailEnqueueClaimedAt: claimedAt,
          emailQueuedAt: null,
          emailSentAt: null,
        }),
        data: expect.objectContaining({
          status: 'QUEUED',
          emailQueuedAt: now,
          emailEnqueueClaimedAt: null,
          lastError: null,
        }),
      }),
    );
  });

  it('does not clear a stale claim when the email job is active', async () => {
    const claimedAt = new Date('2026-10-26T11:40:00.000Z');

    prisma.taskReminder.findMany.mockResolvedValue([
      {
        id: 'reminder-1',
        status: 'QUEUED',
        emailEnqueueClaimedAt: claimedAt,
        emailQueuedAt: null,
        emailSentAt: null,
      },
    ]);

    queues.getEmailJobState.mockResolvedValue('active');

    await service.scan(new Date('2026-10-26T12:00:00.000Z'));

    expect(queues.getEmailJobState).toHaveBeenCalledWith(
      'deadline-reminder-1',
    );
    expect(prisma.taskReminder.updateMany).not.toHaveBeenCalled();
  });

  it('does not automatically recover a stale claim when its email job is missing', async () => {
    const claimedAt = new Date('2026-10-26T11:40:00.000Z');

    prisma.taskReminder.findMany.mockResolvedValue([
      {
        id: 'reminder-1',
        status: 'PENDING',
        emailEnqueueClaimedAt: claimedAt,
        emailQueuedAt: null,
        emailSentAt: null,
      },
    ]);

    queues.getEmailJobState.mockResolvedValue(null);

    await service.scan(new Date('2026-10-26T12:00:00.000Z'));

    expect(queues.getEmailJobState).toHaveBeenCalledWith(
      'deadline-reminder-1',
    );
    expect(prisma.taskReminder.updateMany).not.toHaveBeenCalled();
    expect(queues.enqueueEmail).not.toHaveBeenCalled();
  });

  it('continues scanning if checking a stale email job state fails', async () => {
    prisma.taskReminder.findMany.mockResolvedValue([
      {
        id: 'reminder-1',
        status: 'PENDING',
        emailEnqueueClaimedAt: new Date('2026-10-26T11:40:00.000Z'),
        emailQueuedAt: null,
        emailSentAt: null,
      },
    ]);

    queues.getEmailJobState.mockRejectedValue(
      new Error('Redis temporarily unavailable'),
    );

    await expect(
      service.scan(new Date('2026-10-26T12:00:00.000Z')),
    ).resolves.toBeUndefined();

    expect(prisma.task.findMany).toHaveBeenCalled();
  });

  it('logs stale processing claims without resetting or re-enqueueing them', async () => {
    const now = new Date('2026-10-26T12:00:00.000Z');
    const processingAt = new Date('2026-10-26T11:40:00.000Z');
    const warningSpy = vi
      .spyOn(service['logger'], 'warn')
      .mockImplementation(() => {});

    // First query: stale enqueue recovery finds nothing.
    // Second query: stale processing detection finds a candidate.
    // Third query: no more candidates.
    prisma.taskReminder.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'reminder-stale',
          emailProcessingAt: processingAt,
          lastError: 'Delivery outcome uncertain: SMTP connection failed',
        },
      ])
      .mockResolvedValueOnce([]);

    await service.scan(now);

    expect(prisma.taskReminder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PROCESSING',
          emailProcessingAt: {
            not: null,
            lt: new Date('2026-10-26T11:45:00.000Z'),
          },
          emailSentAt: null,
        }),
        orderBy: { id: 'asc' },
        take: 250,
      }),
    );

    expect(warningSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Stale reminder processing claim needs reconciliation',
      ),
    );
    expect(warningSpy).toHaveBeenCalledWith(
      expect.stringContaining('Automatic resend suppressed.'),
    );
    expect(prisma.taskReminder.updateMany).not.toHaveBeenCalled();
    expect(queues.enqueueEmail).not.toHaveBeenCalled();

    warningSpy.mockRestore();
  });

  it('continues normal reminder scanning if stale processing detection fails', async () => {
    const errorSpy = vi
      .spyOn(service['logger'], 'error')
      .mockImplementation(() => {});

    // Stale enqueue recovery succeeds with no candidates; the processing
    // detection query then fails and should be handled without aborting scan.
    prisma.taskReminder.findMany
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('Database unavailable'));

    await expect(
      service.scan(new Date('2026-10-26T12:00:00.000Z')),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to detect stale reminder processing claims',
      expect.any(String),
    );
    expect(prisma.task.findMany).toHaveBeenCalledTimes(2);

    errorSpy.mockRestore();
  });

  it('clears the periodic timer when the module is destroyed', async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    service.onModuleInit();
    service.onModuleDestroy();

    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });
});