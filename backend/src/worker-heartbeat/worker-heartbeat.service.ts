import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { createRedisConfig } from '../config/redis.config.js';

const HEARTBEAT_KEY = 'taskforge:worker:heartbeat:v1';
const HEARTBEAT_INTERVAL_MS = 10_000;
const HEARTBEAT_TTL_SECONDS = 30;

@Injectable()
export class WorkerHeartbeatService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(WorkerHeartbeatService.name);
  private readonly redis: Redis;
  private readonly instanceId = randomUUID();
  private timer: ReturnType<typeof setInterval> | undefined;
  private stopped = false;

  constructor(config: ConfigService) {
    this.redis = new Redis({
      ...createRedisConfig(config),
      lazyConnect: true,
      connectTimeout: 1000,
      commandTimeout: 1000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times: number) => Math.min(times * 500, 2000),
    });

    this.redis.on('error', (error: Error) => {
      this.logger.warn(`Worker heartbeat Redis error: ${error.message}`);
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.redis.connect();
    } catch (error) {
      this.logger.warn(
        `Worker heartbeat could not connect to Redis: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }

    await this.publishHeartbeat();

    this.timer = setInterval(() => {
      void this.publishHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    this.timer.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    try {
      if (this.redis.status === 'ready') {
        const current = await this.redis.get(HEARTBEAT_KEY);

        // Do not delete a newer worker instance's heartbeat.
        if (current === this.instanceId) {
          await this.redis.del(HEARTBEAT_KEY);
        }
      }
    } catch (error) {
      this.logger.warn(
        `Could not clear worker heartbeat during shutdown: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    } finally {
      this.redis.disconnect();
    }
  }

  private async publishHeartbeat(): Promise<void> {
    if (this.stopped || this.redis.status !== 'ready') {
      return;
    }

    try {
      await this.redis.set(
        HEARTBEAT_KEY,
        this.instanceId,
        'EX',
        HEARTBEAT_TTL_SECONDS,
      );
    } catch (error) {
      this.logger.warn(
        `Worker heartbeat publication failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }
}
