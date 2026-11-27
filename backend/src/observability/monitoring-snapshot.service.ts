import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import type { MonitoringSnapshot } from './metrics.service.js';

interface OutboxSnapshotRow {
  pending: number;
  retrying: number;
  exhausted: number;
  oldestPendingSeconds: number;
  maxAttempts: number;
}

const EMPTY_QUEUE_COUNTS = {
  waiting: 0,
  active: 0,
  delayed: 0,
  failed: 0,
  completed: 0,
  paused: 0,
};
const SNAPSHOT_TTL_MS = 5_000;

@Injectable()
export class MonitoringSnapshotService {
  private readonly logger = new Logger(MonitoringSnapshotService.name);
  private cached: { expiresAt: number; value: MonitoringSnapshot } | undefined;
  private inFlight: Promise<MonitoringSnapshot> | undefined;

  constructor(
    @InjectQueue('taskforge') private readonly queue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  async collect(): Promise<MonitoringSnapshot> {
    const now = Date.now();
    if (this.cached && now < this.cached.expiresAt) return this.cached.value;
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.collectFresh();
    try {
      const value = await this.inFlight;
      this.cached = { expiresAt: Date.now() + SNAPSHOT_TTL_MS, value };
      return value;
    } finally {
      this.inFlight = undefined;
    }
  }

  private async collectFresh(): Promise<MonitoringSnapshot> {
    const [queueResult, outboxResult] = await Promise.allSettled([
      this.queueSnapshot(),
      this.outboxSnapshot(),
    ]);
    if (queueResult.status === 'rejected') {
      this.logger.warn({
        event: 'metrics.queue.snapshot_failed',
        message: 'Queue metrics snapshot failed',
      });
    }
    if (outboxResult.status === 'rejected') {
      this.logger.warn({
        event: 'metrics.outbox.snapshot_failed',
        message: 'Outbox metrics snapshot failed',
      });
    }
    const queue =
      queueResult.status === 'fulfilled'
        ? queueResult.value
        : { healthy: 0 as const, counts: EMPTY_QUEUE_COUNTS };
    const outbox =
      outboxResult.status === 'fulfilled'
        ? outboxResult.value
        : {
            pending: 0,
            retrying: 0,
            exhausted: 0,
            oldestPendingSeconds: 0,
            maxAttempts: 0,
          };
    return {
      queueHealthy: queue.healthy,
      queueCounts: queue.counts,
      outboxPending: outbox.pending,
      outboxRetrying: outbox.retrying,
      outboxExhausted: outbox.exhausted,
      outboxOldestPendingSeconds: outbox.oldestPendingSeconds,
      outboxMaxAttempts: outbox.maxAttempts,
      outboxSnapshotHealthy: outboxResult.status === 'fulfilled' ? 1 : 0,
    };
  }

  private async queueSnapshot() {
    const [version, counts, paused] = await Promise.all([
      this.queue.getVersion(),
      this.queue.getJobCounts(
        'waiting',
        'active',
        'delayed',
        'failed',
        'completed',
      ),
      this.queue.isPaused(),
    ]);
    return {
      healthy:
        version === null || typeof version === 'string'
          ? (1 as const)
          : (0 as const),
      counts: {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        failed: counts.failed ?? 0,
        completed: counts.completed ?? 0,
        paused: paused ? 1 : 0,
      },
    };
  }

  private async outboxSnapshot(): Promise<OutboxSnapshotRow> {
    const rows = await this.prisma.$queryRaw<OutboxSnapshotRow[]>(Prisma.sql`
      SELECT
        COUNT(*)::int AS pending,
        COUNT(*) FILTER (WHERE attempts > 0 AND attempts < 10)::int AS retrying,
        COUNT(*) FILTER (WHERE attempts >= 10)::int AS exhausted,
        COALESCE(EXTRACT(EPOCH FROM (NOW() - MIN("createdAt"))), 0)::float8 AS "oldestPendingSeconds",
        COALESCE(MAX(attempts), 0)::int AS "maxAttempts"
      FROM "OutboxEvent"
      WHERE "publishedAt" IS NULL
    `);
    return (
      rows[0] ?? {
        pending: 0,
        retrying: 0,
        exhausted: 0,
        oldestPendingSeconds: 0,
        maxAttempts: 0,
      }
    );
  }
}
