import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';
import { WorkerHealthService } from './worker-health.service.js';

describe('HealthController', () => {
  const health = {
    checkReadiness: vi.fn(),
  };

  const workerHealth = {
    checkWorker: vi.fn(),
  };

  let controller: HealthController;

  beforeEach(() => {
    vi.resetAllMocks();

    controller = new HealthController(
      health as unknown as HealthService,
      workerHealth as unknown as WorkerHealthService,
    );
  });

  it('returns readiness when all dependencies are healthy', async () => {
    const result = {
      status: 'ok',
      checks: { database: 'up', redis: 'up' },
    };

    health.checkReadiness.mockResolvedValue(result);

    await expect(controller.getReadiness()).resolves.toEqual(result);
  });

  it('throws HTTP 503 and preserves dependency details when readiness fails', async () => {
    const result = {
      status: 'error',
      checks: { database: 'down', redis: 'up' },
    };

    health.checkReadiness.mockResolvedValue(result);

    try {
      await controller.getReadiness();
      throw new Error('Expected readiness check to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);

      const exception = error as ServiceUnavailableException;
      expect(exception.getStatus()).toBe(503);
      expect(exception.getResponse()).toEqual(result);
    }
  });

  it('returns worker health status', async () => {
    const result = { status: 'active' };
    workerHealth.checkWorker.mockResolvedValue(result);

    await expect(controller.getWorkerHealth()).resolves.toEqual(result);
  });

  it('returns liveness without checking dependencies', () => {
    expect(controller.getLiveness()).toEqual({ status: 'ok' });
  });
});
