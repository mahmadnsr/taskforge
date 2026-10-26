# Week 8 — Day 1: Stale Reminder Processing Detection

## Goal

Detect task reminders that remain in `PROCESSING` after a possible worker crash.

A worker can crash after an SMTP provider accepts an email but before the database records the reminder as `SENT`. Therefore, a stale processing claim does not prove that email delivery failed.

## Implementation

- Added a 15-minute stale processing claim threshold to the reminder scheduler.
- The scheduler checks for reminders whose status is `PROCESSING`, whose `emailProcessingAt` timestamp is older than the threshold, and whose `emailSentAt` is `NULL`.
- Candidate reminders are retrieved in batches of 250.
- Each candidate is logged with its reminder ID, processing timestamp, and last recorded error.
- Detection errors are logged without preventing the normal reminder scan from continuing.

## Safety and Delivery Semantics

- Stale processing claims are detected and logged only.
- The scheduler does not automatically reset stale reminders to `PENDING`.
- The scheduler does not automatically enqueue or resend these emails.
- This avoids a potentially duplicate email when the original SMTP delivery outcome is uncertain.
- Manual investigation or a future reconciliation mechanism may be required to resolve stale claims.

The system does not guarantee exactly-once email delivery merely by detecting stale claims.

## Operational Considerations

The 15-minute threshold is an initial operational choice. Validate it against actual worker execution limits, queue lock settings, SMTP timeouts, and expected email delivery latency.

Detection is observability, not recovery. Stale claims still require investigation and an explicit, safe reconciliation strategy.

## Tests and Verification

- Prisma schema validation: passed.
- TypeScript type-check (`npx tsc --noEmit`): passed.
- Production build (`npm run build`): passed.
- Focused scheduler tests: 12 passed.
- Full test suite (`npm test`): 581 tests passed across 34 test files.
- Lint (`npm run lint`): 0 errors, 3 warnings.
- `git diff --check`: passed.

### Known Lint Warnings

The lint run reported:
- Two unused imports (`Organization` and `PrismaClient`) in `src/task-reminders/task-reminder.integration.spec.ts`.
- One `typescript(await-thenable)` warning for `await service.onModuleDestroy()` in `src/task-reminders/task-reminder-scheduler.service.spec.ts`.

These warnings were not changed as part of this task.

## Outcome

The scheduler now detects and logs stale reminder processing claims without automatically retrying emails whose delivery outcome may be uncertain.
