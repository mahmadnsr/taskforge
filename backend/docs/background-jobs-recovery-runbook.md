# TaskForge Background Jobs Recovery Runbook

## Purpose

This runbook describes safe investigation of failed outbox events and
ambiguous reminder email delivery. It does not authorize blind retries.

## 1. Initial checks

1. Confirm API and worker health.
2. Confirm PostgreSQL and Redis connectivity.
3. Inspect worker logs for outbox exhaustion, queue failures, stale reminder
   claims, and uncertain SMTP delivery.
4. Record the event/reminder ID, timestamps, last error, and relevant job ID.
5. Avoid exposing email addresses, credentials, tokens, or message contents
   in shared logs or incident reports.

## 2. Exhausted outbox event

An exhausted event remains unpublished and needs investigation.

1. Identify the outbox event by ID using a read-only database query.
2. Inspect its event type, creation time, attempt count, last error,
   published state, and next-attempt timestamp.
3. Determine whether the corresponding BullMQ job was accepted or processed.
4. Check whether a prior attempt may have published the job even though the
   database publication marker failed.
5. Do not manually reset attempts or clear publication/lock fields without
   a reviewed, event-specific recovery procedure.
6. If replay is approved, use the application's supported queue/outbox
   mechanism and document the idempotency and duplicate-delivery risk.

## 3. Stale reminder enqueue claim

The scheduler compares the deterministic email job's Redis state with the
database reminder state.

- Waiting/delayed job: the scheduler may recover the stale enqueue claim.
- Active job: do not enqueue another copy.
- Missing, completed, or failed job: investigate and reconcile before
  considering a new delivery.
- Redis/database inspection error: preserve the current state and retry
  investigation after service health is restored.

Do not interpret a missing queue job as proof that no email was sent.

## 4. Stale reminder processing claim

A stale PROCESSING reminder may represent an email sent successfully before
the worker crashed, or an uncertain SMTP outcome.

1. Inspect the reminder's processing timestamp and last error.
2. Check worker logs and the SMTP provider's delivery/acceptance records.
3. If provider records confirm delivery, reconcile the database state using
   an approved, audited procedure.
4. If the outcome remains uncertain, escalate for a deliberate decision;
   automatic resend may create a duplicate.
5. Never reset the reminder to PENDING merely because the claim is old.

## 5. SMTP delivery outcome uncertain

A connection error does not necessarily mean the provider rejected the email.

- Preserve the recorded error and reminder identifier.
- Check the SMTP provider's message logs or delivery events.
- Do not automatically resend while the original outcome is unresolved.
- Document the evidence and the decision before manual recovery.

## 6. Safety constraints

- Prefer read-only inspection before any corrective action.
- Do not expose secrets in command history or incident reports.
- Do not delete queue jobs or alter database state as a generic recovery step.
- Use an audited, event-specific recovery procedure for manual corrections.
- Re-run relevant tests after any code change.

## 7. Current limitations

This document is an operational procedure, not an automated recovery tool.
Production monitoring, SMTP-provider verification, and a controlled manual
reconciliation workflow must be configured and exercised for the deployment.
