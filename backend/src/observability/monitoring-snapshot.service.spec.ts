import { afterEach, describe, expect, it, vi } from 'vitest';
import { MonitoringSnapshotService } from './monitoring-snapshot.service.js';

function setup() {
  const queue = {
    getVersion: vi.fn().mockResolvedValue('7.2.0'),
    getJobCounts: vi.fn().mockResolvedValue({
      waiting: 1,
      active: 2,
      delayed: 3,
      failed: 4,
      completed: 5,
    }),
    isPaused: vi.fn().mockResolvedValue(false),
  };
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue([
      {
        pending: 6,
        retrying: 1,
        exhausted: 0,
        oldestPendingSeconds: 7,
        maxAttempts: 2,
      },
    ]),
  };
  return {
    queue,
    prisma,
    service: new MonitoringSnapshotService(queue as never, prisma as never),
  };
}

afterEach(() => vi.restoreAllMocks());

describe('MonitoringSnapshotService', () => {
  it('deduplicates concurrent collection and caches one snapshot for five seconds', async () => {
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const { queue, prisma, service } = setup();

    const [first, concurrent] = await Promise.all([
      service.collect(),
      service.collect(),
    ]);
    expect(concurrent).toBe(first);
    expect(queue.getVersion).toHaveBeenCalledOnce();
    expect(queue.getJobCounts).toHaveBeenCalledOnce();
    expect(queue.isPaused).toHaveBeenCalledOnce();
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();

    expect(await service.collect()).toBe(first);
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();

    now += 5_001;
    await service.collect();
    expect(queue.getVersion).toHaveBeenCalledTimes(2);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('caches visible failures briefly and retries so recovery becomes visible', async () => {
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const { queue, service } = setup();
    queue.getVersion.mockRejectedValueOnce(new Error('Redis unavailable'));

    const failed = await service.collect();
    expect(failed.queueHealthy).toBe(0);
    expect((await service.collect()).queueHealthy).toBe(0);
    expect(queue.getVersion).toHaveBeenCalledOnce();

    now += 5_001;
    const recovered = await service.collect();
    expect(recovered.queueHealthy).toBe(1);
    expect(queue.getVersion).toHaveBeenCalledTimes(2);
  });
});
