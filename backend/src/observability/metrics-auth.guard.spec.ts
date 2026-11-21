import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { MetricsAuthGuard } from './metrics-auth.guard.js';

function context(authorization?: unknown) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }),
  } as never;
}

describe('MetricsAuthGuard', () => {
  const token = 'm'.repeat(48);
  const guard = new MetricsAuthGuard({ get: () => token } as unknown as ConfigService);

  it('allows only the exact bearer token', () => {
    expect(guard.canActivate(context(`Bearer ${token}`))).toBe(true);
  });

  it.each([
    undefined,
    token,
    'Basic credentials',
    `Bearer ${token} injected`,
    `Bearer ${'x'.repeat(48)}`,
  ])('rejects missing or invalid credentials without reflecting them: %s', (header) => {
    expect(() => guard.canActivate(context(header))).toThrow(UnauthorizedException);
  });

  it('keeps the endpoint closed when no metrics token is configured', () => {
    const disabled = new MetricsAuthGuard({ get: () => undefined } as unknown as ConfigService);
    expect(() => disabled.canActivate(context(`Bearer ${token}`))).toThrow(UnauthorizedException);
  });
});
