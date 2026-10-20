# Week 4 — Day 7: Cursor Pagination Performance Benchmark

## Goal

Extend the Day 6 local query benchmark to measure TaskComment pagination
when the selected task contains multiple comments. Measure the first page,
cursor pagination from early, middle, and later positions, and retain the
Task listing, Task search, and Task count workloads for context.

Day 6 and Day 7 are separate benchmark runs. Their results should not be
treated as a controlled before-and-after comparison because the selected
task's comment count and workload coverage differ.

## Environment

- Database: `taskforge_performance`
- Database user: `taskforge_perf`
- PostgreSQL version: 18.6
- Prisma CLI / Client: 6.19.3
- Database endpoint: `127.0.0.1:5433`
- Benchmark implementation: `scripts/performance/benchmark.ts`
- Benchmark report:
  `artifacts/performance/benchmark-5dc69def-0360-4341-a7c8-f0dfe0ef8764.json`
- Report ID: `5dc69def-0360-4341-a7c8-f0dfe0ef8764`
- Report generated at: `2026-10-20T11:59:41.257Z`

The benchmark validates its database URL and checks the connected database
name and user before running. It is intended for the isolated local
performance database.

## Synthetic Dataset

| Entity | Rows |
|---|---:|
| Organization | 3 |
| User | 30 |
| OrganizationMember | 30 |
| Project | 30 |
| ProjectMember | 300 |
| Task | 3,000 |
| TaskComment | 3,100 |

The selected benchmark project contains 100 tasks. The selected task
contains 101 comments, including 100 synthetic comments added for
cursor-pagination testing.

The dataset is synthetic and local. It does not represent production
traffic or data distribution.

## Methodology

- Warm-up runs per workload: 5
- Measured runs per workload: 50
- Workloads: 7
- Metrics: minimum, median, p95, maximum, and mean latency
- Timing: Prisma Client wall-clock duration measured using `performance.now()`
- Operations: read-only benchmark queries
- Result validation: actual row counts checked against expected row counts

The measurements include Prisma Client and local connection/client
overhead. They are not pure PostgreSQL execution times and do not measure
the complete GraphQL request path.

## Results

| Workload | Rows returned | Minimum (ms) | Median (ms) | p95 (ms) | Maximum (ms) | Mean (ms) |
|---|---:|---:|---:|---:|---:|---:|
| Task listing | 100 | 1.530 | 1.751 | 2.706 | 4.911 | 1.894 |
| Task search + pagination | 20 | 0.534 | 0.573 | 0.765 | 0.916 | 0.601 |
| Task count | 100 | 0.288 | 0.306 | 0.388 | 0.437 | 0.326 |
| Comment first page | 11 | 0.326 | 0.443 | 0.617 | 1.119 | 0.452 |
| Comment cursor first page | 11 | 0.441 | 0.526 | 0.810 | 1.697 | 0.568 |
| Comment cursor middle page | 11 | 0.444 | 0.466 | 0.483 | 0.522 | 0.467 |
| Comment cursor later page | 11 | 0.449 | 0.475 | 0.641 | 0.808 | 0.496 |

The JSON report is the machine-readable source of these measurements.

## Cursor Pagination Coverage

The selected task has 101 comments. The benchmark uses ascending
`createdAt` and `id` ordering and tests cursor positions near the beginning,
middle, and later portion of the ordered comment collection.

The cursor predicate uses lexicographic ordering:

- `createdAt > cursor.createdAt`, or
- `createdAt == cursor.createdAt AND id > cursor.id`

This tie-break is important because multiple comments can share a timestamp.
The synthetic data includes duplicate timestamps, so ordering by `createdAt`
alone would not define a unique order.

Each measured cursor workload returned 11 rows, matching its expected
row count. This validates the tested result counts; it does not by itself
prove correctness for every possible concurrent mutation or dataset.

## Validation

- All 7 workloads completed 50 measured runs after 5 warm-up runs.
- Every workload's actual result count matched its expected count.
- The saved JSON report parsed successfully.
- The baseline report from Day 6 was preserved.
- No schema, migration, or index changes were made.

## Limitations

- This is a local, synthetic, warm-cache benchmark.
- Queries were run sequentially, not under concurrent load.
- Measurements include Prisma Client and local connection overhead.
- The benchmark does not measure full GraphQL request latency.
- A single run cannot establish stable performance across different machines,
  cache states, data distributions, or production traffic.
- Day 6 and Day 7 differ in comment dataset size and cursor workload coverage;
  the results are not a controlled before-and-after comparison.
- No index change should be justified by these latency measurements alone.

## Safety

- Benchmark queries were read-only.
- The report was written to a new, unique JSON file.
- The isolated local performance database was used.
- No Neon database was modified.
- No Prisma schema, migration, or index changes were performed.
- Existing baseline artifacts and other untracked files were preserved.

## Conclusion

The extended local benchmark completed successfully. It now covers
TaskComment cursor pagination at multiple positions within a task containing
101 comments, alongside the three Task query workloads.

The measured latencies provide a repeatable local baseline, not proof that
an optimization is necessary. Any proposed query or index optimization
should be evaluated with query plans and a controlled comparison using
representative data.

## Status

Day 7 benchmark completed and validated. Results documented.
Optimization deferred pending further evidence.
