# Week 6 — Background Jobs

## Queue foundation

- BullMQ queue: `taskforge`, backed by Redis.
- NestJS worker: `QueuesProcessor`.
- `test-job` producer and processor.
- Redis connection configured through `REDIS_HOST` and `REDIS_PORT`.
- Test jobs: 3 attempts, exponential backoff starting at 1 second.
- Email jobs: 5 attempts, exponential backoff starting at 2 seconds.
- Completed and failed job retention is bounded.
- Email jobs use deterministic job IDs based on an idempotency key.

## Email provider status

The `send-email` processor currently throws an explicit error because no email provider is configured. Email delivery is not implemented yet. Configure an SMTP/API provider before treating queued email jobs as delivered.

## Idempotency limitations

Deterministic BullMQ job IDs can prevent duplicate insertion while the matching job remains in Redis. This does not guarantee permanent exactly-once delivery. A persistent delivery record and provider-level idempotency should be considered for production.

## Verification

Check Redis with `docker exec redis-cache redis-cli PING`. Expected response: `PONG`.

Run `corepack pnpm build` and `corepack pnpm test` to verify the project.
