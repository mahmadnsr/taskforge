import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { WorkerHealthService } from './worker-health.service.js';

const redisMock = vi.hoisted(() => ({
  status: 'ready' as string,
  connect: vi.fn(),
  disconnect: vi.fn(),
  get: vi.fn(),
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
    on = redisMock.on;
  },
}));

describe('WorkerHealthService', () => {
  let service: WorkerHealthService;

  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.status = 'ready';
    redisMock.connect.mockResolvedValue(undefined);
    redisMock.disconnect.mockReturnValue(undefined);
    redisMock.get.mockResolvedValue('worker-instance-id');

    const config = {
      get: vi.fn((_key: string, defaultValue?: string) => defaultValue),
    } as unknown as ConfigService;

    service = new WorkerHealthService(config);
  });

  it('reports active when a heartbeat exists', async () => {
    await expect(service.checkWorker()).resolves.toEqual({
      status: 'active',
    });
  });

  it('reports unknown when no heartbeat exists', async () => {
    redisMock.get.mockResolvedValueOnce(null);

    await expect(service.checkWorker()).resolves.toEqual({
      status: 'unknown',
    });
  });

  it('reports unavailable when Redis is not ready', async () => {
    redisMock.status = 'end';

    await expect(service.checkWorker()).resolves.toEqual({
      status: 'unavailable',
    });

    expect(redisMock.get).not.toHaveBeenCalled();
  });

  it('reports unavailable when the Redis read fails', async () => {
    redisMock.get.mockRejectedValueOnce(new Error('Redis unavailable'));

    await expect(service.checkWorker()).resolves.toEqual({
      status: 'unavailable',
    });
  });

  it('disconnects Redis during shutdown', async () => {
    await service.onModuleDestroy();

    expect(redisMock.disconnect).toHaveBeenCalledOnce();
  });
});
