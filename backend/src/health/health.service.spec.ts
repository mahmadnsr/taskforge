import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthService } from './health.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CacheService } from '../cache/cache.service.js';

describe('HealthService', () => {
  const prisma = {
    $queryRaw: vi.fn(),
  };

  const cache = {
    pingRedis: vi.fn(),
  };

  let service: HealthService;

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    cache.pingRedis.mockResolvedValue(true);
    service = new HealthService(
      prisma as unknown as PrismaService,
      cache as unknown as CacheService,
    );
  });

  it('reports readiness when PostgreSQL and Redis are reachable', async () => {
    await expect(service.checkReadiness()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up', redis: 'up' },
    });
  });

  it('reports database failure without exposing internal errors', async () => {
    prisma.$queryRaw.mockRejectedValueOnce(
      new Error('sensitive database connection details'),
    );

    await expect(service.checkReadiness()).resolves.toEqual({
      status: 'error',
      checks: { database: 'down', redis: 'up' },
    });
  });

  it('reports Redis failure', async () => {
    cache.pingRedis.mockResolvedValueOnce(false);

    await expect(service.checkReadiness()).resolves.toEqual({
      status: 'error',
      checks: { database: 'up', redis: 'down' },
    });
  });

  it('reports both dependencies down', async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error('database unavailable'));
    cache.pingRedis.mockRejectedValueOnce(new Error('redis unavailable'));

    await expect(service.checkReadiness()).resolves.toEqual({
      status: 'error',
      checks: { database: 'down', redis: 'down' },
    });
  });
});
