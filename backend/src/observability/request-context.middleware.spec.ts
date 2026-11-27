import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { currentRequestId } from './request-context.js';
import { MetricsService } from './metrics.service.js';
import {
  normalizeRequestId,
  normalizedRoute,
  RequestContextMiddleware,
} from './request-context.middleware.js';

describe('request correlation middleware', () => {
  it('accepts bounded safe request IDs and rejects log-injection values', () => {
    expect(normalizeRequestId('client.request-123')).toBe('client.request-123');
    expect(normalizeRequestId('bad\nvalue')).toMatch(/^[a-f0-9-]{36}$/);
    expect(normalizeRequestId('x'.repeat(65))).toMatch(/^[a-f0-9-]{36}$/);
  });

  it('propagates a generated request ID through AsyncLocalStorage and the response header', () => {
    const metrics = new MetricsService();
    const observe = vi.spyOn(metrics, 'observeHttp');
    const middleware = new RequestContextMiddleware(metrics);
    const response = Object.assign(new EventEmitter(), {
      statusCode: 200,
      setHeader: vi.fn(),
    });
    const request = {
      method: 'POST',
      originalUrl: '/graphql?ignored=true',
      headers: { 'x-request-id': 'unsafe\r\nforged' },
    };
    let inside: string | undefined;

    middleware.use(request as never, response as never, () => {
      inside = currentRequestId();
    });
    response.emit('finish');

    expect(inside).toMatch(/^[a-f0-9-]{36}$/);
    expect(response.setHeader).toHaveBeenCalledWith('x-request-id', inside);
    expect(observe).toHaveBeenCalledWith(
      'POST',
      '/graphql',
      200,
      expect.any(Number),
      true,
    );
  });

  it('recognizes the notification SSE route and excludes its lifetime from latency', () => {
    const metrics = new MetricsService();
    const observe = vi.spyOn(metrics, 'observeHttp');
    const middleware = new RequestContextMiddleware(metrics);
    const response = Object.assign(new EventEmitter(), {
      statusCode: 200,
      setHeader: vi.fn(),
    });
    const request = {
      method: 'GET',
      originalUrl: '/notifications/stream?cursor=ignored',
      headers: {},
    };

    expect(normalizedRoute(request as never)).toBe('/notifications/stream');
    middleware.use(request as never, response as never, vi.fn());
    response.emit('close');
    response.emit('finish');

    expect(observe).toHaveBeenCalledWith(
      'GET',
      '/notifications/stream',
      200,
      expect.any(Number),
      false,
    );
    expect(observe).toHaveBeenCalledOnce();
  });
});
