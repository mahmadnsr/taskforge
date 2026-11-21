import { afterEach, describe, expect, it, vi } from 'vitest';
import { runWithRequestContext } from './request-context.js';
import {
  StructuredLogger,
  observabilitySanitizeForTest,
} from './structured-logger.service.js';

describe('StructuredLogger', () => {
  afterEach(() => vi.restoreAllMocks());

  it('writes structured JSON with component, event, severity, timestamp, and request ID', () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const logger = new StructuredLogger('api');

    runWithRequestContext({ requestId: 'request-safe-123' }, () => {
      logger.log(
        { event: 'test.completed', message: 'Completed', count: 2 },
        'TestComponent',
      );
    });

    const record = JSON.parse(String(write.mock.calls[0][0]));
    expect(record).toEqual(
      expect.objectContaining({
        severity: 'info',
        process: 'api',
        component: 'TestComponent',
        event: 'test.completed',
        request_id: 'request-safe-123',
        message: 'Completed',
        count: 2,
      }),
    );
    expect(Number.isNaN(Date.parse(record.timestamp))).toBe(false);
  });

  it('redacts sensitive keys and secret-like strings without emitting log-control characters', () => {
    const sanitized = observabilitySanitizeForTest({
      password: 'secret-password',
      refreshToken: 'refresh-value',
      headers: { 'x-api-key': 'header-secret' },
      payload: { email: 'private@example.test' },
      variables: { title: 'private GraphQL value' },
      nested: {
        authorization: 'Bearer abc.def.ghi',
        safe: 'line one\nline two',
      },
      message:
        'DATABASE_URL=postgresql://user:password@db.example/app?sslmode=require token=invite-secret',
    });
    const serialized = JSON.stringify(sanitized);

    expect(serialized).not.toContain('secret-password');
    expect(serialized).not.toContain('refresh-value');
    expect(serialized).not.toContain('abc.def.ghi');
    expect(serialized).not.toContain('user:password');
    expect(serialized).not.toContain('invite-secret');
    expect(serialized).not.toContain('db.example');
    expect(serialized).not.toContain('header-secret');
    expect(serialized).not.toContain('private@example.test');
    expect(serialized).not.toContain('private GraphQL value');
    expect(serialized).not.toContain('\\n');
    expect(serialized).toContain('[REDACTED]');
  });

  it('redacts connection strings and authorization or cookie text in error messages', () => {
    const sanitized = observabilitySanitizeForTest(
      new Error(
        'redis://cache.internal:6379 Authorization: Basic opaque-access-value Cookie: sid=session-secret; refresh=other-secret',
      ),
    );
    const serialized = JSON.stringify(sanitized);

    expect(serialized).not.toContain('cache.internal');
    expect(serialized).not.toContain('opaque-access-value');
    expect(serialized).not.toContain('session-secret');
    expect(serialized).not.toContain('other-secret');
  });

  it('redacts GraphQL variables embedded in otherwise unstructured text', () => {
    const serialized = JSON.stringify(
      observabilitySanitizeForTest(
        'resolver failed; variables: {"password":"arbitrary submitted value"}',
      ),
    );

    expect(serialized).not.toContain('arbitrary submitted value');
    expect(serialized).toContain('variables=[REDACTED]');
  });
});
