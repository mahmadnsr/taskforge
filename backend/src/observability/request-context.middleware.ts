import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service.js';
import { runWithRequestContext } from './request-context.js';

const SAFE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SSE_ROUTE = '/notifications/stream';

export function normalizeRequestId(value: unknown): string {
  return typeof value === 'string' && SAFE_REQUEST_ID.test(value)
    ? value
    : randomUUID();
}

export function normalizedRoute(request: Pick<Request, 'originalUrl'>): string {
  const path = request.originalUrl.split('?', 1)[0];
  switch (path) {
    case '/graphql':
    case '/health/live':
    case '/health/ready':
    case '/health/worker':
    case '/metrics':
    case SSE_ROUTE:
      return path;
    default:
      return '/other';
  }
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HttpRequest');

  constructor(private readonly metrics: MetricsService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const requestId = normalizeRequestId(request.headers['x-request-id']);
    const route = normalizedRoute(request);
    const start = performance.now();
    response.setHeader('x-request-id', requestId);

    runWithRequestContext({ requestId }, () => {
      let completed = false;
      const complete = () => {
        if (completed) return;
        completed = true;
        const durationMs = performance.now() - start;
        const isEventStream = route === SSE_ROUTE;
        this.metrics.observeHttp(
          request.method,
          route,
          response.statusCode,
          durationMs,
          !isEventStream,
        );
        if (route === '/health/live' || route === '/metrics') return;
        const entry = {
          event: isEventStream ? 'http.sse.closed' : 'http.request.completed',
          message: isEventStream
            ? 'SSE connection closed'
            : 'HTTP request completed',
          method: request.method,
          route,
          status_code: response.statusCode,
          ...(isEventStream
            ? { connection_lifetime_ms: Number(durationMs.toFixed(3)) }
            : { duration_ms: Number(durationMs.toFixed(3)) }),
        };
        if (response.statusCode >= 500) this.logger.error(entry);
        else if (response.statusCode >= 400) this.logger.warn(entry);
        else this.logger.log(entry);
      };
      response.once('finish', complete);
      response.once('close', complete);
      next();
    });
  }
}
