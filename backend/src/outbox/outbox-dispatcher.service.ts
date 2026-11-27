import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  QueuesService,
  TaskEventPayload,
} from '../queues/queues.service.js';

interface ClaimedOutboxEvent {
  id: string;
  eventType: string;
  payload: Prisma.JsonValue;
  attempts: number;
}

const POLL_INTERVAL_MS = 1_000;
const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 10;
const LOCK_TIMEOUT_MS = 60_000;
const BASE_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;

@Injectable()
export class OutboxDispatcherService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private readonly workerId = randomUUID();
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queuesService: QueuesService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.dispatchBatch();
    }, POLL_INTERVAL_MS);

    this.timer.unref();
    void this.dispatchBatch();
    this.logger.log({ event: 'outbox.dispatcher.started', message: 'Outbox dispatcher started' });
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    while (this.running) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    this.logger.log({ event: 'outbox.dispatcher.stopped', message: 'Outbox dispatcher stopped' });
  }

  async dispatchBatch(): Promise<void> {
    if (this.running || this.stopped) {
      return;
    }

    this.running = true;
    let events: ClaimedOutboxEvent[] = [];
    let processedCount = 0;

    try {
      events = await this.claimBatch();

      for (const event of events) {
        if (this.stopped) {
          break;
        }

        await this.publishEvent(event);
        processedCount += 1;
      }
    } catch (error) {
      this.logger.error({ event: 'outbox.batch.failed', message: 'Outbox batch failed', error });
    } finally {
      const unprocessedEvents = events.slice(processedCount);

      if (unprocessedEvents.length > 0) {
        try {
          await this.prisma.outboxEvent.updateMany({
            where: {
              id: { in: unprocessedEvents.map((event) => event.id) },
              lockedBy: this.workerId,
              publishedAt: null,
            },
            data: {
              lockedAt: null,
              lockedBy: null,
            },
          });
        } catch (error) {
          this.logger.error({
            event: 'outbox.lock_release.failed',
            message: 'Could not release locks for unprocessed outbox events; stale-lock recovery will retry',
            error,
          });
        }
      }

      this.running = false;
    }
  }

  private async claimBatch(): Promise<ClaimedOutboxEvent[]> {
    return this.prisma.$transaction(async (tx) => {
      const events = await tx.$queryRaw<ClaimedOutboxEvent[]>(
        Prisma.sql`
          SELECT "id", "eventType", "payload", "attempts"
          FROM "OutboxEvent"
          WHERE "publishedAt" IS NULL
            AND "attempts" < ${MAX_ATTEMPTS}
            AND "nextAttemptAt" <= NOW()
            AND (
              "lockedAt" IS NULL
              OR "lockedAt" < NOW() - (${LOCK_TIMEOUT_MS} * INTERVAL '1 millisecond')
            )
          ORDER BY "createdAt" ASC
          LIMIT ${BATCH_SIZE}
          FOR UPDATE SKIP LOCKED
        `,
      );

      if (events.length === 0) {
        return [];
      }

      await tx.outboxEvent.updateMany({
        where: {
          id: { in: events.map((event) => event.id) },
        },
        data: {
          lockedAt: new Date(),
          lockedBy: this.workerId,
        },
      });

      return events;
    });
  }

  private async publishEvent(event: ClaimedOutboxEvent): Promise<void> {
    try {
      const payload = this.parsePayload(event);

      await this.queuesService.enqueueTaskEvent(payload);

      await this.prisma.outboxEvent.updateMany({
        where: {
          id: event.id,
          lockedBy: this.workerId,
          publishedAt: null,
        },
        data: {
          publishedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          lastError: null,
        },
      });
    } catch (error) {
      await this.recordFailure(event, error);
    }
  }

  private parsePayload(event: ClaimedOutboxEvent): TaskEventPayload {
    const payload = event.payload;

    if (
      payload === null ||
      typeof payload !== 'object' ||
      Array.isArray(payload)
    ) {
      throw new Error(`Outbox event ${event.id} has an invalid payload.`);
    }

    const data = payload as Record<string, unknown>;
    const validTypes = [
      'TASK_CREATED',
      'TASK_ASSIGNED',
      'TASK_STATUS_CHANGED',
    ];

    if (
      typeof data.eventId !== 'string' ||
      data.eventId.trim() === '' ||
      typeof data.organizationId !== 'string' ||
      typeof data.taskId !== 'string' ||
      typeof data.actorId !== 'string' ||
      typeof data.eventType !== 'string' ||
      !validTypes.includes(data.eventType) ||
      data.eventType !== event.eventType ||
      typeof data.occurredAt !== 'string' ||
      Number.isNaN(Date.parse(data.occurredAt))
    ) {
      throw new Error(`Outbox event ${event.id} has an invalid event payload.`);
    }

    return data as unknown as TaskEventPayload;
  }

  private async recordFailure(
    event: ClaimedOutboxEvent,
    error: unknown,
  ): Promise<void> {
    const nextAttempts = event.attempts + 1;
    const message =
      error instanceof Error ? error.message : String(error);

    const delayMs = Math.min(
      BASE_RETRY_DELAY_MS * 2 ** Math.max(0, nextAttempts - 1),
      MAX_RETRY_DELAY_MS,
    );

    try {
      await this.prisma.outboxEvent.updateMany({
        where: {
          id: event.id,
          lockedBy: this.workerId,
          publishedAt: null,
        },
        data: {
          attempts: { increment: 1 },
          nextAttemptAt: new Date(Date.now() + delayMs),
          lockedAt: null,
          lockedBy: null,
          lastError:
            nextAttempts >= MAX_ATTEMPTS
              ? `[EXHAUSTED ${MAX_ATTEMPTS}/${MAX_ATTEMPTS}] ${message}`.slice(0, 2_000)
              : message.slice(0, 2_000),
        },
      });

      if (nextAttempts >= MAX_ATTEMPTS) {
        this.logger.error({
          event: 'outbox.event.exhausted',
          message: 'Outbox event exhausted publication attempts',
          attempts: MAX_ATTEMPTS,
        });
      } else {
        this.logger.warn({
          event: 'outbox.event.retry_scheduled',
          message: 'Outbox event publication failed; retry scheduled',
          attempt: nextAttempts,
          maximum_attempts: MAX_ATTEMPTS,
          retry_delay_ms: delayMs,
        });
      }
    } catch (recordError) {
      this.logger.error({
        event: 'outbox.failure_record.failed',
        message: 'Could not record outbox failure; stale-lock recovery will retry',
        error: recordError,
      });
    }
  }
}
