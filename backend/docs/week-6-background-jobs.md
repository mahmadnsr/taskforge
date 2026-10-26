# Background Jobs and Reliability

## Architecture

TaskForge uses BullMQ and Redis for background jobs. PostgreSQL stores
application data and transactional outbox events. The worker is started
separately from the API.

Relevant commands:

- `pnpm start:worker:dev` — start the worker in development.
- `pnpm start:worker` — start the compiled worker.
- `pnpm test` — run the Vitest suite.
- `pnpm build` — compile the application.

## Email delivery

The email service uses Nodemailer and SMTP configuration:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

A configured SMTP provider is required for real email delivery. Placeholder
values such as `smtp.example.com` are not a working provider configuration.
Do not treat a queued email as delivered merely because the job was enqueued.

For reminder emails, the processor claims the reminder atomically before
delivery. If SMTP delivery has an uncertain outcome, or SMTP accepts the
message but the success state cannot be persisted, automatic retry is
suppressed to reduce duplicate-email risk. Such cases require operational
reconciliation; they cannot safely be assumed to have failed.

Ordinary emails without a reminder ID retain their configured BullMQ retry
behavior.

## Transactional outbox

The outbox dispatcher claims unpublished events using database locking and
`FOR UPDATE SKIP LOCKED`. It publishes events to BullMQ and then records
publication in PostgreSQL.

This is an at-least-once publication design. Queue publication may succeed
while the database update fails, causing a later retry to publish again.
Deterministic job IDs reduce duplicates while the corresponding BullMQ job
is retained; they do not provide an unconditional exactly-once guarantee.

Failed outbox events use retry scheduling. Events that exhaust the configured
attempt limit remain unpublished and require operational review.

## Deadline reminders

The reminder scheduler scans due-date windows and enqueues deterministic
email jobs. It checks stale enqueue claims against Redis job state. Missing
or ambiguous jobs are logged for reconciliation rather than blindly
re-enqueued.

Stale reminder processing claims are detected and logged. They are not
automatically reset or resent because a worker may have sent an email and
crashed before recording success.

## Operational limitations

- Configure and verify a real SMTP provider before testing actual delivery.
- Monitor outbox events that exhaust their retry limit.
- Investigate stale reminder processing claims and ambiguous queue states.
- Do not manually reset reminder status or resend an email until delivery
  has been reconciled with the SMTP provider and database state.
- Keep Redis and PostgreSQL availability, worker health, and queue backlog
  under operational monitoring.

## Verification

The Week 8 reliability verification run on 2026-10-26 passed lint, build,
TypeScript, and 614 tests across 35 test files. The SMTP integration test
was excluded because the environment did not have verified SMTP settings.
These results establish the tested code paths, not successful real-world
SMTP delivery.
