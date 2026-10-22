import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { OutboxDispatcherService } from './outbox-dispatcher.service.js';

const EVENT = {
  id: 'outbox-1',
  eventType: 'TASK_CREATED',
  payload: {
    eventId: 'created-task-1',
    organizationId: 'org-1',
    taskId: 'task-1',
    actorId: 'user-1',
    eventType: 'TASK_CREATED',
    occurredAt: '2026-10-22T00:00:00.000Z',
  },
  attempts: 0,
};

function setup() {
  const events = [EVENT];

  const tx = {
    $queryRaw: vi.fn().mockImplementation(async () => events),
    outboxEvent: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };

  const prisma = {
    $transaction: vi.fn().mockImplementation(async (callback) =>
      callback(tx),
    ),
    outboxEvent: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };

  const queuesService = {
    enqueueTaskEvent: vi.fn().mockResolvedValue({ id: 'task-event-job-1' }),
  };

  const service = new OutboxDispatcherService(
    prisma as never,
    queuesService as never,
  );

  return { service, prisma, tx, queuesService };
}

describe('OutboxDispatcherService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('claims pending events using SKIP LOCKED', async () => {
    const { service, tx } = setup();

    await service.dispatchBatch();

    expect(tx.$queryRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        strings: expect.any(Array),
      }),
    );

    const query = tx.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(query.sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(query.sql).toContain('"publishedAt" IS NULL');
  });

  it('publishes a valid task event and marks the outbox row published', async () => {
    const { service, queuesService, prisma } = setup();

    await service.dispatchBatch();

    expect(queuesService.enqueueTaskEvent).toHaveBeenCalledWith(
      EVENT.payload,
    );

    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith({
      where: {
        id: EVENT.id,
        lockedBy: expect.any(String),
        publishedAt: null,
      },
      data: {
        publishedAt: expect.any(Date),
        lockedAt: null,
        lockedBy: null,
        lastError: null,
      },
    });
  });

  it('records a queue failure and schedules a retry', async () => {
    const { service, queuesService, prisma } = setup();

    queuesService.enqueueTaskEvent.mockRejectedValue(
      new Error('Redis unavailable'),
    );

    await service.dispatchBatch();

    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith({
      where: {
        id: EVENT.id,
        lockedBy: expect.any(String),
        publishedAt: null,
      },
      data: {
        attempts: { increment: 1 },
        nextAttemptAt: expect.any(Date),
        lockedAt: null,
        lockedBy: null,
        lastError: 'Redis unavailable',
      },
    });
  });

  it('marks an event as exhausted after the final retry', async () => {
    const { service, queuesService, prisma, tx } = setup();

    tx.$queryRaw.mockResolvedValue([{ ...EVENT, attempts: 9 }]);
    queuesService.enqueueTaskEvent.mockRejectedValue(
      new Error('Redis unavailable'),
    );

    await service.dispatchBatch();

    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith({
      where: {
        id: EVENT.id,
        lockedBy: expect.any(String),
        publishedAt: null,
      },
      data: expect.objectContaining({
        attempts: { increment: 1 },
        lastError: '[EXHAUSTED 10/10] Redis unavailable',
      }),
    });
  });

  it('does not publish an invalid event payload and records the failure', async () => {
    const { service, queuesService, prisma, tx } = setup();

    tx.$queryRaw.mockResolvedValue([
      {
        ...EVENT,
        payload: { eventId: 'missing-required-fields' },
      },
    ]);

    await service.dispatchBatch();

    expect(queuesService.enqueueTaskEvent).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastError: expect.stringContaining('invalid event payload'),
        }),
      }),
    );
  });

  it('does not start a second batch while one is running', async () => {
    const { service, prisma, tx } = setup();

    let releaseQuery: (() => void) | undefined;
    tx.$queryRaw.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseQuery = () => resolve([]);
        }),
    );

    const first = service.dispatchBatch();

    await Promise.resolve();

    const second = service.dispatchBatch();

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    releaseQuery?.();
    await Promise.all([first, second]);
  });

  it('releases locks for claimed events left unprocessed during shutdown', async () => {
    const { service, prisma, tx, queuesService } = setup();

    const secondEvent = {
      ...EVENT,
      id: 'outbox-2',
      payload: {
        ...EVENT.payload,
        eventId: 'created-task-2',
        taskId: 'task-2',
      },
    };

    tx.$queryRaw.mockResolvedValue([EVENT, secondEvent]);

    let releaseFirstPublish: (() => void) | undefined;
    queuesService.enqueueTaskEvent.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseFirstPublish = () => resolve({ id: 'task-event-job-1' });
        }),
    );

    const dispatch = service.dispatchBatch();

    // Wait until the first event is being published.
    for (let i = 0; i < 20 && !releaseFirstPublish; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(releaseFirstPublish).toBeDefined();

    const shutdown = service.onModuleDestroy();
    releaseFirstPublish?.();

    await Promise.all([dispatch, shutdown]);

    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['outbox-2'] },
        lockedBy: expect.any(String),
        publishedAt: null,
      },
      data: {
        lockedAt: null,
        lockedBy: null,
      },
    });

    expect(queuesService.enqueueTaskEvent).toHaveBeenCalledTimes(1);
  });

  it('stops polling when the module is destroyed', async () => {
    const { service } = setup();

    service.onModuleInit();
    await service.onModuleDestroy();

    await service.dispatchBatch();

    expect(service['stopped']).toBe(true);
  });
});
