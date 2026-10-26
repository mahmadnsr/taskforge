import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { createRedisConfig } from '../config/redis.config.js';

const HEARTBEAT_KEY = 'taskforge:worker:heartbeat:v1';

export type WorkerHealthResult =
  | { status: 'active' }
  | { status: 'unknown' }
  | { status: 'unavailable' };

@Injectable()
export class WorkerHealthService {
  private readonly redis: Redis;

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

    this.redis.on('error', () => {
      // Health responses must not expose connection details.
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.redis.connect();
    } catch {
      // The endpoint reports dependency unavailability instead of failing startup.
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.redis.disconnect();
  }

  async checkWorker(): Promise<WorkerHealthResult> {
    if (this.redis.status !== 'ready') {
      return { status: 'unavailable' };
    }

    try {
      const heartbeat = await this.redis.get(HEARTBEAT_KEY);
      return heartbeat ? { status: 'active' } : { status: 'unknown' };
    } catch {
      return { status: 'unavailable' };
    }
  }
}
