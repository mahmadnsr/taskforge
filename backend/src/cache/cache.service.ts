import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly redis: Redis;

  constructor(config: ConfigService) {
    this.redis = new Redis({
      host: config.get<string>('REDIS_HOST', '127.0.0.1'),
      port: Number(config.get<string>('REDIS_PORT', '6379')),
      lazyConnect: true,
      connectTimeout: 1000,
      commandTimeout: 1000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times: number) => Math.min(times * 500, 2000),
    });

    this.redis.on('error', (error: Error) => {
      this.logger.warn(`Redis connection error: ${error.message}`);
    });

    this.redis.on('ready', () => {
      this.logger.log('Redis cache connection is ready');
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.redis.connect();
    } catch (error) {
      this.logger.warn(
        `Redis cache unavailable; database fallback will be used: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.redis.disconnect();
  }

  private versionKey(organizationId: string): string {
    return `taskforge:projects:v1:org:${organizationId}:version`;
  }

  async getOrganizationVersion(
    organizationId: string,
  ): Promise<number | null> {
    try {
      if (this.redis.status !== 'ready') {
        return null;
      }

      const value = await this.redis.get(this.versionKey(organizationId));
      return value === null ? 0 : Number(value);
    } catch (error) {
      this.logger.warn(
        `Cache version read failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );

      return null;
    }
  }

  async incrementOrganizationVersion(
    organizationId: string,
  ): Promise<void> {
    try {
      if (this.redis.status !== 'ready') {
        return;
      }

      await this.redis.incr(this.versionKey(organizationId));
    } catch (error) {
      this.logger.warn(
        `Cache version invalidation failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    try {
      if (this.redis.status !== 'ready') {
        return null;
      }

      const value = await this.redis.get(key);

      if (value === null) {
        return null;
      }

      return JSON.parse(value) as T;
    } catch (error) {
      this.logger.warn(
        `Cache read failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );

      return null;
    }
  }

  async setJson(
    key: string,
    value: unknown,
    ttlSeconds: number,
  ): Promise<void> {
    try {
      if (this.redis.status !== 'ready') {
        return;
      }

      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn(
        `Cache write failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }
}
