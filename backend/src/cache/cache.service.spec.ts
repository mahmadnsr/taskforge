import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service.js';

const redisMock = vi.hoisted(() => ({
  status: 'ready' as string,
  connect: vi.fn(),
  disconnect: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  incr: vi.fn(),
  ping: vi.fn(),
  on: vi.fn(),
}));

vi.mock('ioredis', () => ({
  Redis: class {
    get status() {
      return redisMock.status;
    }
    connect = redisMock.connect;
    disconnect = redisMock.disconnect;
    get = redisMock.get;
    set = redisMock.set;
    incr = redisMock.incr;
    ping = redisMock.ping;
    on = redisMock.on;
  },
}));

describe('CacheService', () => {
  let service: CacheService;
  let config: ConfigService;

  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.status = 'ready';
    redisMock.connect.mockResolvedValue(undefined);
    redisMock.disconnect.mockReturnValue(undefined);
    redisMock.get.mockResolvedValue(null);
    redisMock.set.mockResolvedValue('OK');
    redisMock.incr.mockResolvedValue(1);
    redisMock.ping.mockResolvedValue('PONG');

    config = {
      get: vi.fn((_key: string, defaultValue?: string) => defaultValue),
    } as unknown as ConfigService;

    service = new CacheService(config);
  });

  it('returns true when Redis responds to ping', async () => {
    await expect(service.pingRedis()).resolves.toBe(true);
    expect(redisMock.ping).toHaveBeenCalledOnce();
  });

  it('returns false when Redis is unavailable', async () => {
    redisMock.status = 'end';

    await expect(service.pingRedis()).resolves.toBe(false);
    expect(redisMock.ping).not.toHaveBeenCalled();
  });

  it('returns null when Redis is unavailable during a version lookup', async () => {
    redisMock.status = 'end';

    await expect(service.getOrganizationVersion('org-1')).resolves.toBeNull();
    expect(redisMock.get).not.toHaveBeenCalled();
  });

  it('returns null when a Redis version read fails', async () => {
    redisMock.get.mockRejectedValueOnce(new Error('Redis unavailable'));

    await expect(service.getOrganizationVersion('org-1')).resolves.toBeNull();
  });

  it('returns null when a JSON cache read fails', async () => {
    redisMock.get.mockRejectedValueOnce(new Error('Redis unavailable'));

    await expect(service.getJson('projects:key')).resolves.toBeNull();
  });

  it('returns null for malformed cached JSON', async () => {
    redisMock.get.mockResolvedValueOnce('{invalid-json');

    await expect(service.getJson('projects:key')).resolves.toBeNull();
  });

  it('does not throw when writing JSON to Redis fails', async () => {
    redisMock.set.mockRejectedValueOnce(new Error('Redis unavailable'));

    await expect(
      service.setJson('projects:key', [{ id: 'project-1' }], 30),
    ).resolves.toBeUndefined();
  });

  it('does not throw when organization version invalidation fails', async () => {
    redisMock.incr.mockRejectedValueOnce(new Error('Redis unavailable'));

    await expect(
      service.incrementOrganizationVersion('org-1'),
    ).resolves.toBeUndefined();
  });

  it('does not issue Redis commands when Redis is unavailable', async () => {
    redisMock.status = 'end';

    await service.incrementOrganizationVersion('org-1');
    await service.setJson('projects:key', { value: 1 }, 30);

    expect(redisMock.incr).not.toHaveBeenCalled();
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('disconnects Redis when the module is destroyed', async () => {
    await service.onModuleDestroy();

    expect(redisMock.disconnect).toHaveBeenCalledOnce();
  });
});
