import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { WorkerHeartbeatService } from './worker-heartbeat.service.js';

const redisMock = vi.hoisted(() => ({
  status: 'ready' as string,
  connect: vi.fn(),
  disconnect: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
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
    del = redisMock.del;
    on = redisMock.on;
  },
}));

describe('WorkerHeartbeatService', () => {
  let service: WorkerHeartbeatService;

  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.status = 'ready';
    redisMock.connect.mockResolvedValue(undefined);
    redisMock.disconnect.mockReturnValue(undefined);
    redisMock.get.mockResolvedValue(null);
    redisMock.set.mockResolvedValue('OK');
    redisMock.del.mockResolvedValue(1);

    const config = {
      get: vi.fn((_key: string, defaultValue?: string) => defaultValue),
    } as unknown as ConfigService;

    service = new WorkerHeartbeatService(config);
  });

  it('publishes a heartbeat with a 30-second TTL', async () => {
    await service.onModuleInit();

    expect(redisMock.set).toHaveBeenCalledWith(
      'taskforge:worker:heartbeat:v1',
      expect.any(String),
      'EX',
      30,
    );

    await service.onModuleDestroy();
  });

  it('does not publish when Redis is unavailable', async () => {
    redisMock.status = 'end';

    await service.onModuleInit();

    expect(redisMock.set).not.toHaveBeenCalled();

    await service.onModuleDestroy();
  });

  it('only deletes its own heartbeat during shutdown', async () => {
    await service.onModuleInit();

    redisMock.get.mockResolvedValueOnce('different-worker-instance');

    await service.onModuleDestroy();

    expect(redisMock.del).not.toHaveBeenCalled();
    expect(redisMock.disconnect).toHaveBeenCalledOnce();
  });

  it('clears its own heartbeat during shutdown', async () => {
    await service.onModuleInit();

    const publishedInstance = redisMock.set.mock.calls[0]?.[1];
    redisMock.get.mockResolvedValueOnce(publishedInstance);

    await service.onModuleDestroy();

    expect(redisMock.del).toHaveBeenCalledWith(
      'taskforge:worker:heartbeat:v1',
    );
  });
});
