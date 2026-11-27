# Performance Engineering

TaskForge uses targeted database indexes, pagination,
bounded queries, and asynchronous background processing
to improve application performance.

## Historical Benchmark Results

Benchmark date: October 20, 2026.

### Environment

- Database: PostgreSQL 18.6
- Measurement: Prisma Client wall-clock latency
- Warm-up runs: 5 per workload
- Measured runs: 50 per workload
- Project dataset: 100 tasks
- Selected task: 101 comments
- Total measured executions: 350

### Results

| Operation | Median (ms) | p95 (ms) |
| --- | ---: | ---: |
| Task listing | 1.751 | 2.706 |
| Task search and pagination | 0.573 | 0.765 |
| Task count | 0.306 | 0.388 |
| Comment first page | 0.443 | 0.617 |
| Comment cursor - first | 0.526 | 0.810 |
| Comment cursor - middle | 0.466 | 0.483 |
| Comment cursor - later | 0.475 | 0.641 |

Each workload validates its expected result count.
Cursor pagination uses createdAt and id ordering.

These measurements include Prisma Client overhead.
They do not represent end-to-end GraphQL latency,
production throughput, or concurrent-user capacity.

## Optimization Strategies

- Composite indexes for tenant-scoped queries.
- Cursor pagination for activity and comment retrieval.
- Indexed task filtering and sorting.
- Background processing through Redis and BullMQ.
- Bounded observability metrics.
- Cached queue and outbox metric snapshots.

## Larger-Scale Verification

The isolated staging benchmark supports a synthetic
dataset of 14,500 tasks across 20 projects.

The staging scripts support execution-plan inspection,
API latency measurement, and worker/Redis outage recovery
verification.

Current release benchmark results should be recorded
separately from the historical measurements above.

## Engineering Trade-offs

- Indexes improve targeted reads but add write overhead.
- Pagination bounds response size but requires stable ordering.
- Asynchronous processing reduces synchronous request work
  but introduces eventual consistency.
- Cached metrics reduce collection overhead but may briefly
  reflect older infrastructure state.

## Benchmark Sources

- [Historical benchmark report](../backend/artifacts/performance/benchmark-5dc69def-0360-4341-a7c8-f0dfe0ef8764.json)
- [Earlier benchmark report](../backend/artifacts/performance/benchmark-ebb531db-706d-44ed-a3d9-138a3df6e8be.json)
- [Staging benchmark script](../staging/performance-benchmark.mjs)
- [Reliability verification](../staging/reliability-qa.mjs)
- [Staging instructions](../staging/README.md)
