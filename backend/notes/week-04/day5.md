# Week 4 — Day 5: Query Performance Analysis

## Goal

Inspect existing Task and TaskComment queries, database indexes,
and PostgreSQL planner statistics to identify potential optimization areas.

## Environment

- Database: Neon PostgreSQL
- PostgreSQL version: 18.6
- Prisma CLI / Client: 6.19.3
- Database connection: Verified successfully

## Table Statistics

Observed exact row counts:

| Table | Rows |
|---|---:|
| Project | 1 |
| Task | 0 |
| TaskComment | 0 |

PostgreSQL statistics reported:

- Task: 0 estimated live rows, 0 estimated dead rows.
- TaskComment: 0 estimated live rows, 0 estimated dead rows.
- Project: 1 estimated live row, 1 estimated dead row.
- `last_analyze` and `last_autoanalyze` were null for these tables.

These statistics do not establish a performance problem.

## Existing Indexes

### Task

- Primary key on `id`
- Unique index on `(id, organizationId)`
- Index on `organizationId`
- Index on `(projectId, status)`
- Index on `(projectId, priority)`
- Index on `createdById`
- Index on `assigneeId`
- Index on `dueDate`

### TaskComment

- Primary key on `id`
- Index on `(taskId, createdAt)`
- Index on `(authorId, organizationId)`

## Query Analysis

### Task listing

The `listByProject()` query filters by `organizationId` and `projectId`,
then orders by `createdAt DESC`.

An index involving `(organizationId, projectId, createdAt)` may be
worth investigating when representative data is available.

No index was added because current evidence does not establish a benefit.

### Task search

The search query supports optional status, priority, and assignee filters,
case-insensitive substring search, dynamic sorting, offset pagination,
and a separate count query.

Substring search and count-query costs should be evaluated using
representative data before proposing changes.

### Task comment cursor pagination

The query filters by `taskId` and `organizationId`, uses a cursor based
on `createdAt` and `id`, and orders by both fields.

The existing `(taskId, createdAt)` index is relevant to this query.
Whether including `id` in a composite index improves performance remains
unverified.

## EXPLAIN Observation

A read-only EXPLAIN using placeholder UUIDs produced an Index Scan on
`Task_organizationId_idx`, followed by a filter on `projectId` and a sort
on `createdAt DESC`.

This is a planner estimate using placeholder values, not a benchmark
of a representative workload.

## Index Usage Statistics

All inspected Task and TaskComment indexes reported zero scans in the
observed statistics.

This does not prove that the indexes are unnecessary. The tables have
little or no data, and statistics may reflect limited activity or resets.

## Safety

- Only read-only inspection queries were run.
- No test data was inserted.
- No schema changes or migrations were performed.
- No indexes were created or removed.

## Conclusion

No index changes are justified by the current evidence.

Future performance testing should use an isolated test database or
development branch with representative data. Compare execution plans
and query performance before and after any proposed index change.

## Status

Analysis completed; performance optimization deferred pending
representative test data.
