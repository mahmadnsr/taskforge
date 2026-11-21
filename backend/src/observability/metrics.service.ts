import { Injectable } from '@nestjs/common';

const BUCKETS_SECONDS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];
const MAX_WINDOW_SAMPLES = 1_024;
const HTTP_METHODS = new Set(['GET', 'POST', 'OPTIONS', 'HEAD']);
const HTTP_ROUTES = new Set([
  '/graphql',
  '/health/live',
  '/health/ready',
  '/health/worker',
  '/metrics',
  '/notifications/stream',
  '/other',
]);
const GRAPHQL_OPERATIONS = new Set(['query', 'mutation', 'subscription']);

interface RequestSeries {
  count: number;
  errors: number;
  durationCount: number;
  sumSeconds: number;
  buckets: number[];
  samplesMs: number[];
}

export interface MonitoringSnapshot {
  queueHealthy: 0 | 1;
  queueCounts: Record<
    'waiting' | 'active' | 'delayed' | 'failed' | 'completed' | 'paused',
    number
  >;
  outboxPending: number;
  outboxRetrying: number;
  outboxExhausted: number;
  outboxOldestPendingSeconds: number;
  outboxMaxAttempts: number;
  outboxSnapshotHealthy: 0 | 1;
}

@Injectable()
export class MetricsService {
  private readonly http = new Map<string, RequestSeries>();
  private readonly graphql = new Map<string, RequestSeries>();

  observeHttp(
    method: string,
    route: string,
    statusCode: number,
    durationMs: number,
    includeDuration = true,
  ): void {
    const safeMethod = HTTP_METHODS.has(method) ? method : 'OTHER';
    const safeRoute = HTTP_ROUTES.has(route) ? route : '/other';
    const statusClass = `${Math.min(5, Math.max(1, Math.floor(statusCode / 100)))}xx`;
    this.observe(
      this.http,
      `${safeMethod}|${safeRoute}|${statusClass}`,
      durationMs,
      statusCode >= 400,
      includeDuration,
    );
  }

  observeGraphql(
    operation: string,
    hasErrors: boolean,
    durationMs: number,
  ): void {
    const safeOperation = GRAPHQL_OPERATIONS.has(operation)
      ? operation
      : 'unknown';
    this.observe(this.graphql, safeOperation, durationMs, hasErrors);
  }

  render(snapshot: MonitoringSnapshot): string {
    const lines = [
      '# HELP taskforge_http_requests_total HTTP requests by bounded route and status class.',
      '# TYPE taskforge_http_requests_total counter',
      '# HELP taskforge_http_request_errors_total HTTP responses with status 4xx or 5xx.',
      '# TYPE taskforge_http_request_errors_total counter',
      '# HELP taskforge_http_request_duration_seconds HTTP request duration excluding long-lived SSE connections.',
      '# TYPE taskforge_http_request_duration_seconds histogram',
      '# HELP taskforge_http_request_duration_window_ms Nearest-rank p50 and p95 over the latest 1024 request durations per label set, in milliseconds; excludes SSE connections and resets on process restart.',
      '# TYPE taskforge_http_request_duration_window_ms gauge',
    ];
    for (const [key, series] of [...this.http.entries()].sort(
      ([left], [right]) => left.localeCompare(right),
    )) {
      const [method, route, statusClass] = key.split('|');
      const labels = `method="${method}",route="${route}",status_class="${statusClass}"`;
      lines.push(`taskforge_http_requests_total{${labels}} ${series.count}`);
      lines.push(
        `taskforge_http_request_errors_total{${labels}} ${series.errors}`,
      );
      this.renderDuration(lines, 'taskforge_http_request', labels, series);
    }
    lines.push(
      '# HELP taskforge_graphql_requests_total GraphQL operations by operation type.',
    );
    lines.push('# TYPE taskforge_graphql_requests_total counter');
    lines.push(
      '# HELP taskforge_graphql_request_errors_total GraphQL operations that encountered one or more errors.',
    );
    lines.push('# TYPE taskforge_graphql_request_errors_total counter');
    lines.push(
      '# HELP taskforge_graphql_request_duration_seconds GraphQL operation duration.',
    );
    lines.push('# TYPE taskforge_graphql_request_duration_seconds histogram');
    lines.push(
      '# HELP taskforge_graphql_request_duration_window_ms Nearest-rank p50 and p95 over the latest 1024 GraphQL operation durations per operation type, in milliseconds; resets on process restart.',
    );
    lines.push('# TYPE taskforge_graphql_request_duration_window_ms gauge');
    for (const [operation, series] of [...this.graphql.entries()].sort(
      ([left], [right]) => left.localeCompare(right),
    )) {
      const labels = `operation="${operation}"`;
      lines.push(`taskforge_graphql_requests_total{${labels}} ${series.count}`);
      lines.push(
        `taskforge_graphql_request_errors_total{${labels}} ${series.errors}`,
      );
      this.renderDuration(lines, 'taskforge_graphql_request', labels, series);
    }
    lines.push(
      '# HELP taskforge_queue_redis_up Whether the BullMQ Redis snapshot succeeded.',
      '# TYPE taskforge_queue_redis_up gauge',
      `taskforge_queue_redis_up ${snapshot.queueHealthy}`,
      '# HELP taskforge_queue_jobs Current BullMQ job count by bounded state.',
      '# TYPE taskforge_queue_jobs gauge',
    );
    for (const [state, count] of Object.entries(snapshot.queueCounts)) {
      lines.push(`taskforge_queue_jobs{state="${state}"} ${count}`);
    }
    lines.push(
      '# HELP taskforge_outbox_pending Unpublished outbox events.',
      '# TYPE taskforge_outbox_pending gauge',
      `taskforge_outbox_pending ${snapshot.outboxPending}`,
      '# HELP taskforge_outbox_retrying Unpublished outbox events with at least one attempt but below the exhaustion threshold.',
      '# TYPE taskforge_outbox_retrying gauge',
      `taskforge_outbox_retrying ${snapshot.outboxRetrying}`,
      '# HELP taskforge_outbox_exhausted Unpublished outbox events at or above the exhaustion threshold.',
      '# TYPE taskforge_outbox_exhausted gauge',
      `taskforge_outbox_exhausted ${snapshot.outboxExhausted}`,
      '# HELP taskforge_outbox_oldest_pending_seconds Age of the oldest unpublished outbox event in seconds.',
      '# TYPE taskforge_outbox_oldest_pending_seconds gauge',
      `taskforge_outbox_oldest_pending_seconds ${snapshot.outboxOldestPendingSeconds}`,
      '# HELP taskforge_outbox_max_attempts Highest attempt count among unpublished outbox events.',
      '# TYPE taskforge_outbox_max_attempts gauge',
      `taskforge_outbox_max_attempts ${snapshot.outboxMaxAttempts}`,
      '# HELP taskforge_outbox_snapshot_up Whether the PostgreSQL outbox snapshot succeeded.',
      '# TYPE taskforge_outbox_snapshot_up gauge',
      `taskforge_outbox_snapshot_up ${snapshot.outboxSnapshotHealthy}`,
    );
    return `${lines.join('\n')}\n`;
  }

  private observe(
    target: Map<string, RequestSeries>,
    key: string,
    durationMs: number,
    isError: boolean,
    includeDuration = true,
  ): void {
    const series = target.get(key) ?? {
      count: 0,
      errors: 0,
      durationCount: 0,
      sumSeconds: 0,
      buckets: BUCKETS_SECONDS.map(() => 0),
      samplesMs: [],
    };
    series.count += 1;
    if (isError) series.errors += 1;
    if (!includeDuration) {
      target.set(key, series);
      return;
    }
    series.durationCount += 1;
    const seconds = Math.max(0, durationMs) / 1_000;
    series.sumSeconds += seconds;
    BUCKETS_SECONDS.forEach((bucket, index) => {
      if (seconds <= bucket) series.buckets[index] += 1;
    });
    series.samplesMs.push(Math.max(0, durationMs));
    if (series.samplesMs.length > MAX_WINDOW_SAMPLES) series.samplesMs.shift();
    target.set(key, series);
  }

  private renderDuration(
    lines: string[],
    prefix: string,
    labels: string,
    series: RequestSeries,
  ): void {
    series.buckets.forEach((count, index) => {
      lines.push(
        `${prefix}_duration_seconds_bucket{${labels},le="${BUCKETS_SECONDS[index]}"} ${count}`,
      );
    });
    lines.push(
      `${prefix}_duration_seconds_bucket{${labels},le="+Inf"} ${series.durationCount}`,
    );
    lines.push(
      `${prefix}_duration_seconds_sum{${labels}} ${series.sumSeconds.toFixed(6)}`,
    );
    lines.push(
      `${prefix}_duration_seconds_count{${labels}} ${series.durationCount}`,
    );
    const sorted = [...series.samplesMs].sort((a, b) => a - b);
    lines.push(
      `${prefix}_duration_window_ms{${labels},quantile="0.5"} ${this.percentile(sorted, 0.5).toFixed(3)}`,
    );
    lines.push(
      `${prefix}_duration_window_ms{${labels},quantile="0.95"} ${this.percentile(sorted, 0.95).toFixed(3)}`,
    );
  }

  private percentile(sorted: number[], fraction: number): number {
    if (sorted.length === 0) return 0;
    return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
  }
}
