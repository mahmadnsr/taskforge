import { describe, expect, it } from 'vitest';
import { MetricsService, type MonitoringSnapshot } from './metrics.service.js';

const snapshot: MonitoringSnapshot = {
  queueHealthy: 1,
  queueCounts: {
    waiting: 1,
    active: 2,
    delayed: 3,
    failed: 4,
    completed: 5,
    paused: 0,
  },
  outboxPending: 6,
  outboxRetrying: 1,
  outboxExhausted: 0,
  outboxOldestPendingSeconds: 7.5,
  outboxMaxAttempts: 2,
  outboxSnapshotHealthy: 1,
};

describe('MetricsService', () => {
  it('exports bounded labels, error counts, correct histograms, and documented p50/p95 values', () => {
    const metrics = new MetricsService();
    metrics.observeHttp('POST', '/graphql', 200, 5);
    metrics.observeHttp('POST', '/graphql', 200, 10);
    metrics.observeHttp('POST', '/graphql', 200, 6_000);
    metrics.observeHttp('POST', '/graphql', 500, 30);
    metrics.observeGraphql('mutation', true, 20);

    const output = metrics.render(snapshot);
    expect(output).toContain(
      'taskforge_http_requests_total{method="POST",route="/graphql",status_class="2xx"} 3',
    );
    expect(output).toContain(
      'taskforge_http_request_errors_total{method="POST",route="/graphql",status_class="5xx"} 1',
    );
    expect(output).toContain(
      'taskforge_http_request_duration_seconds_bucket{method="POST",route="/graphql",status_class="2xx",le="0.005"} 1',
    );
    expect(output).toContain(
      'taskforge_http_request_duration_seconds_bucket{method="POST",route="/graphql",status_class="2xx",le="0.01"} 2',
    );
    expect(output).toContain(
      'taskforge_http_request_duration_seconds_bucket{method="POST",route="/graphql",status_class="2xx",le="+Inf"} 3',
    );
    expect(output).toContain(
      'taskforge_http_request_duration_seconds_sum{method="POST",route="/graphql",status_class="2xx"} 6.015000',
    );
    expect(output).toContain(
      'taskforge_http_request_duration_seconds_count{method="POST",route="/graphql",status_class="2xx"} 3',
    );
    expect(output).toContain(
      'taskforge_http_request_duration_window_ms{method="POST",route="/graphql",status_class="5xx",quantile="0.95"} 30.000',
    );
    expect(output).toContain(
      'taskforge_graphql_request_errors_total{operation="mutation"} 1',
    );
    expect(output).toContain('taskforge_queue_jobs{state="failed"} 4');
    expect(output).toContain('taskforge_outbox_pending 6');
    expect(output).not.toContain('organizationId');
    expect(output).not.toContain('taskId');
  });

  it('counts SSE completions without recording connection lifetime as request duration', () => {
    const metrics = new MetricsService();
    metrics.observeHttp('GET', '/notifications/stream', 200, 600_000, false);

    const output = metrics.render(snapshot);
    const labels =
      'method="GET",route="/notifications/stream",status_class="2xx"';
    expect(output).toContain(`taskforge_http_requests_total{${labels}} 1`);
    expect(output).toContain(
      `taskforge_http_request_duration_seconds_count{${labels}} 0`,
    );
    expect(output).toContain(
      `taskforge_http_request_duration_seconds_sum{${labels}} 0.000000`,
    );
    expect(output).not.toContain('600.000000');
  });

  it('normalizes label values again at the metrics boundary', () => {
    const metrics = new MetricsService();
    metrics.observeHttp('TRACE"', '/users/attacker"', 200, 1);
    metrics.observeGraphql('named-operation-controlled-by-client', false, 1);

    const output = metrics.render(snapshot);
    expect(output).toContain(
      'method="OTHER",route="/other",status_class="2xx"',
    );
    expect(output).toContain('operation="unknown"');
    expect(output).not.toContain('attacker');
    expect(output).not.toContain('named-operation');
  });

  it('declares HELP and TYPE exactly once for every emitted metric family', () => {
    const metrics = new MetricsService();
    metrics.observeHttp('GET', '/health/ready', 200, 2);
    metrics.observeHttp('POST', '/graphql', 500, 4);
    metrics.observeGraphql('query', false, 3);
    const output = metrics.render(snapshot);
    const sampleFamilies = new Set(
      output
        .split('\n')
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => line.split(/[ {]/, 1)[0])
        .map((name) => name.replace(/_(?:bucket|count|sum)$/, '')),
    );

    for (const family of sampleFamilies) {
      expect(output.match(new RegExp(`^# HELP ${family} `, 'gm'))).toHaveLength(
        1,
      );
      expect(output.match(new RegExp(`^# TYPE ${family} `, 'gm'))).toHaveLength(
        1,
      );
    }
  });
});
