# Week 8 — Day 2: Transactional Outbox Delivery Guarantees

## Objective

Verify and document the outbox dispatcher's behavior when queue publication
succeeds but the database update marking the event as published fails.

## Delivery semantics

The outbox dispatcher provides at-least-once publication behavior, not an
exactly-once delivery guarantee.

The dispatcher publishes an event to the queue and then updates the outbox
record with `publishedAt`. If queue publication succeeds but that database
update fails, the dispatcher records a failure and schedules a retry.

Consequently, a retry can attempt to publish an event that was already accepted
by the queue.

## Existing duplicate mitigation

Task-event jobs use a deterministic BullMQ job ID derived from the event ID.
This can prevent duplicate jobs while the corresponding job remains retained
in Redis. It is not a permanent deduplication guarantee.

The current task-event processor only logs event details and does not perform
database-side business mutations. A durable consumer-idempotency mechanism
should be introduced if a future consumer performs side effects that must not
be applied more than once.

## Regression coverage

Added a regression test in
`src/outbox/outbox-dispatcher.service.spec.ts` that simulates:

1. Queue publication succeeds.
2. The database update that marks the outbox event as published fails.
3. The dispatcher records the failure, increments the attempt count, schedules
   a retry, and releases the event lock.

## Verification

- Focused queue and outbox tests: 34 tests passed across 3 test files.
- TypeScript check: `npx tsc --noEmit` passed.
- Whitespace validation: `git diff --check` passed.

## Operational consideration

An event that reaches the configured maximum number of attempts remains
unpublished and requires operational review. Do not interpret successful queue
publication as proof that the outbox record was durably marked as published.
