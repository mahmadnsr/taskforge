# Week 4 — Day 6: Local Query Performance Benchmark

## Goal

Measure baseline latency for Task listing, Task search with pagination,
Task count, and TaskComment cursor pagination using synthetic data in an
isolated local PostgreSQL database.

This continues the Day 5 analysis with representative local data. The
Day 5 Neon observations and this local benchmark are separate environments
and should not be compared as if they were the same workload.

## Environment

- Database: `taskforge_performance`
- Database user: `taskforge_perf`
- PostgreSQL version: 18.6
- Prisma CLI / Client: 6.19.3
- Database endpoint: `127.0.0.1:5433`
- Benchmark implementation: `scripts/performance/benchmark.ts`
- Seed implementation: `scripts/performance/seed.ts`
- Benchmark output:
  `artifacts/performance/benchmark-ebb531db-706d-44ed-a3d9-138a3df6e8be.json`

The benchmark script validates the database URL and verifies the connected
database name and database user before measuring queries. It is intended
for the local performance database only.

## Synthetic Dataset

| Entity | Rows |
|---|---:|
| Organization | 3 |
| User | 30 |
| OrganizationMember | 30 |
| Project | 30 |
| ProjectMember | 300 |
| Task | 3,000 |
| TaskComment | 3,000 |

The selected benchmark project contains 100 tasks. The selected task
contains one comment.

The seed process verified the expected counts and ran `ANALYZE` on
`Task` and `TaskComment`.

## Methodology

- Warm-up runs per query: 5
- Measured runs per query: 50
- Reported metrics: minimum, median, p95, maximum, and mean latency
- Timing method: Prisma Client wall-clock duration using `performance.now()`
- Query operations: read-only
- No application code, Prisma schema, migrations, or indexes were changed.

These measurements include Prisma Client and local connection/client
overhead. They are not pure PostgreSQL execution times and do not measure
the complete GraphQL request path.

## Baseline Results

| Query | Rows returned | Minimum (ms) | Median (ms) | p95 (ms) | Maximum (ms) | Mean (ms) |
|---|---:|---:|---:|---:|---:|---:|
| Task listing | 100 | 1.598 | 1.744 | 2.779 | 3.211 | 1.884 |
| Task search + pagination | 20 | 0.854 | 1.020 | 1.285 | 1.302 | 1.034 |
| Task count | 100 | 0.287 | 0.314 | 0.527 | 1.405 | 0.357 |
| Comment first page | 1 | 0.327 | 0.342 | 0.398 | 0.410 | 0.349 |
| Comment cursor page | 0 | 0.426 | 0.488 | 0.662 | 1.473 | 0.522 |

The JSON report is the machine-readable record of these measurements.

## Query and Index Observations

### Task listing

The benchmark fetched 100 tasks filtered by `organizationId` and
`projectId`, ordered by `createdAt DESC`.

The previously inspected query plan used a BitmapAnd involving
`Task_projectId_priority_idx` and `Task_organizationId_idx`, followed by
a Bitmap Heap Scan and a sort. The observed plan returned 100 rows.

### Task search + pagination

The benchmark searched the selected project's tasks using case-insensitive
substring matching on title and description, ordered by `createdAt DESC`
and `id ASC`, and returned up to 20 rows.

The previously inspected plan applied the text filter after retrieving
rows through bitmap index access and used a top-N sort.

Ordinary B-tree indexes generally do not accelerate arbitrary
`ILIKE '%term%'` substring searches. Larger datasets and representative
search terms should be tested before proposing an index or search strategy
change.

### Task count

The count query filters by `organizationId` and `projectId`.
The previously inspected plan used bitmap index access followed by an
aggregate operation.

The measured Prisma Client duration is not the database execution time
of the count operation alone.

### TaskComment first page

The query filters by `organizationId` and `taskId`, orders by
`createdAt ASC` and `id ASC`, and requests up to 11 rows.

The previously inspected plan used `TaskComment_taskId_createdAt_idx`
with an organization filter and incremental sorting.

### TaskComment cursor page

The benchmark used the selected comment's `(createdAt, id)` position as
the cursor boundary. Because the selected task contains only one comment,
the next page returned zero rows.

Consequently, this run does not establish performance for deep cursor
pagination or tasks with many comments. A separate controlled dataset with
multiple comments per task is needed for that evaluation.

## Limitations

- This is a local, warm-cache baseline on a synthetic dataset.
- Each measured query was run sequentially, not under concurrent load.
- The sample size and dataset do not represent production traffic.
- The benchmark measures Prisma Client wall-clock duration, not complete
  GraphQL request latency or PostgreSQL execution time alone.
- Comment cursor pagination has not been meaningfully stress-tested because
  the selected task has only one comment.
- The benchmark uses fixed sample IDs and should be updated to select
  benchmark entities dynamically if the dataset is regenerated.
- The measured results are a baseline, not proof that an optimization is
  necessary or that a particular index is optimal.

## Safety

- Synthetic data was stored in the isolated local performance database.
- Benchmark queries were read-only.
- No Neon database was modified during this benchmark.
- No Prisma schema changes, migrations, or index changes were performed.
- The Day 5 documentation was preserved.

## Conclusion

The baseline measurements and query-plan observations are recorded.
No index changes are justified solely by these results.

Future work should include a larger dataset, multiple comments per task,
and a controlled comparison of execution plans and latency before and
after any proposed optimization. Concurrency testing should be performed
separately if workload behavior under simultaneous requests is required.

## Status

Local baseline benchmark completed. Results documented; optimization
deferred pending broader workload testing and additional evidence.
