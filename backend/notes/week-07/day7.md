# Week 07 — Day 7 Engineering Notes

## Objective

Conduct a read-only security, configuration, and reliability audit of the TaskForge backend, focusing on production configuration, queue processing, outbox publication, and reminder recovery.

No application code was changed as part of this audit.

## Areas Reviewed

### HTTP and Environment Configuration

- Helmet security headers are enabled.
- Content Security Policy is enabled in production and disabled in development to avoid breaking the development GraphQL explorer.
- CORS origins are read from `CORS_ORIGINS`; environment validation checks configured origins.
- The application listens using `process.env.PORT` with a default of 3000.
- GraphQL throttling has an integration test that verifies requests exceeding the configured limit are blocked.
- Production error handling and environment validation were reviewed earlier in the audit.

Operational note: an unset or empty production CORS allowlist may block browser-based frontend requests. Confirm the production environment configuration before deployment.

### Queue Configuration

- Task events use deterministic BullMQ job IDs derived from event IDs.
- Email jobs use deterministic IDs derived from email idempotency keys.
- Queue jobs have configured retry attempts, exponential backoff, and bounded completed/failed job retention.
- Ordinary email jobs retry when sending throws.
- Reminder email failures intentionally suppress automatic retries when delivery outcome is uncertain, reducing duplicate-email risk.

### Reminder Processing

- Reminder emails use an atomic database claim and a claim timestamp token.
- Conditional updates ensure the worker only finalizes a reminder when its claim is still valid.
- Stale task reminders are skipped when task state or recipient information no longer matches.
- The scheduler has stale enqueue-claim recovery logic and a test for recovering a stale claim when the corresponding deterministic job is waiting.
- Missing, active, completed, and failed Redis jobs are not automatically re-enqueued by this recovery path, avoiding potentially duplicate email delivery.

### Transactional Outbox

- Outbox events are claimed in a transaction using `FOR UPDATE SKIP LOCKED`.
- The dispatcher prevents overlapping batches within one process.
- Queue publication success is followed by an outbox published-state update.
- Failures are recorded with exponential backoff, capped retry delay, and a maximum of 10 attempts.
- Exhausted events remain unpublished and require operational review.
- Shutdown waits for an active batch and attempts to release locks for events left unprocessed.
- Unit tests cover claiming, successful publication, queue failure/retry, exhausted attempts, invalid payloads, overlapping batches, shutdown lock release, and stopping the poller.
- The dispatcher is registered in the worker module.

## Findings and Follow-up Items

1. **Outbox duplicate-publication window**
   Queue publication can succeed while the subsequent database update fails. The event may be published again. Deterministic BullMQ job IDs reduce duplication while the corresponding job remains retained, but do not guarantee permanent exactly-once processing. Downstream consumers should be idempotent.

2. **Uncertain reminder email delivery**
   SMTP errors can occur after a provider accepts an email. Suppressing automatic retry reduces duplicate risk but can leave delivery status uncertain. Operational reconciliation is needed for these cases.

3. **Reminder PROCESSING recovery**
   Stale enqueue-claim recovery was confirmed. Full recovery behavior for a worker crash after a reminder enters PROCESSING was not conclusively established during this audit and remains a follow-up.

4. **Exhausted outbox events**
   Events that reach 10 failed attempts remain unpublished and are logged for operational review. Automated alerting and a documented replay/reconciliation procedure were not verified.

5. **Deployment configuration**
   The repository search did not find Docker, Compose, or CI workflow files within the searched scope. This does not prove such files are absent elsewhere. Production deployment instructions and reverse-proxy configuration should be documented and verified.

6. **Rate-limit proxy behavior**
   `trust proxy` was configured in the isolated rate-limit integration test. Production reverse-proxy behavior was not conclusively verified and should be checked against the actual deployment topology.

## Audit Scope and Limitations

- Existing tenant-isolation checks were not repeated.
- No full test suite or real SMTP integration was rerun during this audit.
- Findings reflect source and test files inspected, not a live production deployment.
- No code changes, staging, or commits were made as part of the audit.

## Result

The reviewed configuration, queue, outbox, and reminder mechanisms have useful security and reliability safeguards. The follow-up items above remain open; this audit does not claim complete production readiness.
