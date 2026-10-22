# TaskForge — Week 06B Detailed Engineering Notes

## 1. Week 06B Overview

### Objective

Build and verify a reliable background-processing workflow for task deadline reminders using:

- Transactional Outbox
- PostgreSQL
- Prisma
- Redis
- BullMQ
- NestJS worker process
- SMTP email delivery

### Problems addressed

A task-management application needs to handle work that should not execute inside the original GraphQL request.

For example, when a task is created or its deadline approaches, the application might need to:

- Record an event.
- Schedule background work.
- Send a reminder email.
- Retry delivery after a temporary failure.
- Recover pending work after a worker restart.
- Track whether a reminder was sent successfully.

Executing all this synchronously in a GraphQL resolver would make requests slower and introduce unnecessary coupling between the API and email delivery.

Week 06B introduced and verified the infrastructure needed for this asynchronous workflow.

---

## 2. Transactional Outbox Pattern

### 2.1 The problem it solves

Consider a task creation operation that needs to update PostgreSQL and enqueue a BullMQ job.

A naive implementation might look like this:

1. Save the task in PostgreSQL.
2. Add a job to Redis.

What happens if step 1 succeeds but Redis becomes unavailable before step 2?

The task exists, but the corresponding background job might never be created.

The reverse order is also problematic: a job could be queued before the database transaction commits, and the transaction might subsequently fail.

These are examples of a **dual-write problem**.

PostgreSQL and Redis are separate systems. A normal database transaction cannot atomically commit changes to both.

### 2.2 The Outbox solution

The Transactional Outbox pattern records the business change and the event representing that change in the same database transaction.

Conceptually:

```text
Application operation
        |
        v
PostgreSQL transaction
        |
        +---- Save business data
        |
        +---- Save outbox event
        |
        v
Transaction commits
        |
        v
Outbox dispatcher
        |
        v
BullMQ / Redis
        |
        v
Background worker
```

If the transaction rolls back, both the business changes and the outbox event roll back.

If the transaction commits, the event is persisted and can be dispatched later, even if Redis is temporarily unavailable.

### 2.3 Important distinction

The Outbox pattern does not make PostgreSQL and Redis one atomic transaction.

Instead, it makes the database change and event record atomic, then uses a separate dispatcher to deliver the event to the queue.

This provides durable event recording and eventual dispatch, assuming the dispatcher continues operating and failures are handled correctly.

### 2.4 Why this matters for TaskForge

TaskForge uses PostgreSQL as its source of truth for business data.

Redis and BullMQ handle background execution.

The Outbox separates these responsibilities and reduces the chance of permanently losing an event simply because Redis was unavailable at the time of the original database operation.

---

## 3. Outbox Dispatcher

### 3.1 Responsibility

The Outbox dispatcher reads pending event records and attempts to publish their corresponding work to BullMQ.

Its conceptual workflow is:

1. Find eligible outbox records.
2. Claim records for processing.
3. Dispatch their corresponding jobs.
4. Record successful dispatch or update failure information.
5. Retry eligible records later.

The implementation also needs to prevent concurrent dispatcher instances from unnecessarily claiming the same records.

### 3.2 Concurrency control

The implementation uses PostgreSQL's:

```sql
FOR UPDATE SKIP LOCKED
```

This is useful when multiple workers or dispatcher instances compete to process pending records.

- `FOR UPDATE` locks the selected rows for the transaction.
- `SKIP LOCKED` allows another transaction to skip rows already locked by a concurrent transaction.

This can improve parallel processing without forcing every dispatcher to wait for the same records.

**Important:** This mechanism coordinates database row claims. It does not, by itself, guarantee exactly-once job delivery.

### 3.3 Recorded implementation settings

The current implementation uses these settings:

| Setting | Value |
|---|---:|
| Dispatch polling interval | 1 second |
| Dispatch batch size | 25 |
| Maximum outbox attempts | 10 |
| Lock timeout | 60 seconds |
| Base retry delay | 1 second |
| Maximum retry delay | 5 minutes |

The dispatcher also performs an initial dispatch attempt when it starts.

These are implementation settings, not universal recommendations. They can be adjusted as workload and latency requirements evolve.

### 3.4 Retry behavior

Suppose dispatching an event fails temporarily.

Instead of immediately abandoning the event, the dispatcher can record the failure and make another attempt after a delay.

Conceptually:

```text
Pending event
     |
     v
Dispatch attempt
     |
     +---- Success ----> Record successful dispatch
     |
     +---- Failure ----> Record failure
                              |
                              v
                        Retry later
```

The increasing delay reduces unnecessary repeated requests during an outage.

For example, if Redis is unavailable, repeatedly attempting dispatch every few milliseconds would create unnecessary load without making Redis recover faster.

### 3.5 At-least-once delivery and idempotency

An important distributed-systems detail is that a dispatcher can sometimes publish a job successfully but fail before recording that success in PostgreSQL.

After recovery, it may attempt to publish the same event again.

Therefore, the Outbox should be designed around **at-least-once delivery**, unless a stronger guarantee has been independently established.

Useful safeguards include:

- Stable event identifiers.
- Deterministic BullMQ job IDs.
- Idempotent event handling.
- Database uniqueness constraints where appropriate.
- Explicit handling of duplicate events.

A deterministic job ID can help prevent duplicate queue jobs while the original job remains in BullMQ, but it is not a universal exactly-once guarantee.

---

## 4. Task Deadline Reminder Scheduler

### 4.1 Purpose

TaskForge needs to identify tasks approaching their deadlines and arrange reminder delivery.

The scheduler handles this periodically instead of relying on someone to open the application at the right time.

### 4.2 Recorded implementation settings

| Setting | Value |
|---|---:|
| Scheduled scan interval | 5 minutes |
| Reminder window 1 | Approximately 24 hours before deadline |
| Reminder window 2 | Approximately 1 hour before deadline |
| Window tolerance | ±5 minutes |
| Initial scan | On scheduler startup |

The scheduler also clears its timer during module destruction.

### 4.3 How reminder windows work

Suppose a task is due at 18:00 tomorrow.

The 24-hour reminder window is centered around 18:00 today.

Because the scheduler scans periodically, a tolerance window helps it identify tasks whose reminder times fall between scans.

Conceptually:

```text
Task deadline
      |
      | 24 hours before
      v
24-hour reminder window
      |
      | 23 hours before
      v
Time passes
      |
      | 1 hour before
      v
1-hour reminder window
      |
      v
Task deadline
```

The actual behavior depends on the task's stored deadline, the scheduler's scan timing and the implementation's database filters.

### 4.4 Why the tolerance window matters

A scheduler that checks only for an exact timestamp match is fragile.

If a scan runs at 17:59:58 but the target reminder time is 18:00:00, an exact-match query might miss the task.

A time window gives the scheduler a practical range in which to identify eligible reminders.

### 4.5 Duplicate-reminder considerations

A five-minute polling scheduler can encounter the same task during multiple scans.

Therefore, the reminder workflow needs a mechanism to prevent duplicate logical reminders.

Depending on the implementation, suitable safeguards include:

- A unique reminder record for a task and reminder type.
- A database uniqueness constraint.
- A stable idempotency key.
- A deterministic queue job ID.
- A persistent reminder delivery status.

A queue job ID alone is not sufficient for every duplicate-prevention scenario, especially if completed jobs are removed.

### 4.6 Scheduler reliability limitation

The scheduler performs an initial scan when it starts, but a crash during a scan can leave some eligible work for the next scan.

A robust design should ensure that eligible reminders remain discoverable until they are recorded or successfully scheduled.

The scheduler's five-minute interval is a periodic discovery mechanism; it is not a hard real-time delivery guarantee.

---

## 5. SMTP Email Delivery

### 5.1 Why SMTP is used

SMTP allows TaskForge to send emails through a configured mail provider.

In this implementation, SMTP credentials are configured through environment variables rather than embedded in source code.

The application can use an email service to construct and send reminder messages.

### 5.2 Environment configuration

SMTP configuration is stored in the backend's `.env` file.

The file is:

- Git-ignored.
- Configured with restrictive file permissions.
- Used locally by the application.

The recorded file permission was `600`, which restricts access to the file owner.

**Security rules:**

- Never commit `.env`.
- Never paste SMTP passwords or application passwords into chat.
- Never print the complete environment file when debugging.
- If credentials are exposed, revoke or rotate them.

### 5.3 Actual delivery verification

The SMTP workflow was tested beyond a simple unit test.

A real reminder email was received in the test inbox:

```text
Subject:
Task due in 24 hours:
DEADLINE-REMINDER-TEST-e1cbe258-e0d8-41e9-bf6a-89444c7a5c98
```

The corresponding reminder record reached:

```text
SENT
```

The associated BullMQ job completed successfully, and its recorded `lastError` was `null`.

This establishes that the configured SMTP integration successfully delivered a test reminder in the tested environment.

It does not guarantee that every future email will reach the recipient's inbox; external mail providers can still reject, delay or filter messages.

---

## 6. BullMQ and Redis Architecture

### 6.1 Component responsibilities

TaskForge separates background processing into distinct responsibilities:

| Component | Responsibility |
|---|---|
| PostgreSQL | Persistent business data and outbox records |
| Prisma | Database access |
| Redis | Queue storage and coordination |
| BullMQ | Job scheduling, processing state and retries |
| NestJS worker | Executes queued jobs |
| Email service | Sends emails through SMTP |
| Outbox dispatcher | Publishes recorded events |
| Reminder scheduler | Discovers tasks requiring reminders |

This separation allows API operations and background processing to evolve independently.

### 6.2 Queue name

The primary application queue is:

```text
taskforge
```

The application uses a separate temporary queue for the isolated retry verification performed during Week 06B.

That temporary queue is deleted after the test.

### 6.3 Supported job types

The recorded `QueuesProcessor` handles these job types:

```text
test-job
task-event
send-email
```

Unknown job types throw an error.

This is intentional: silently accepting an unsupported job could make a job appear successful even though the requested work was never performed.

### 6.4 Queue service defaults

The current queue service uses the following settings:

| Job type | Attempts | Backoff delay | Completed-job retention | Failed-job retention |
|---|---:|---:|---:|---:|
| `test-job` | 3 | 1,000 ms | 100 | 500 |
| `task-event` | 5 | 1,000 ms | 500 | 1,000 |
| `send-email` | 5 | 2,000 ms | 500 | 1,000 |

The task-event and email jobs use exponential backoff.

These settings apply to jobs created through the corresponding service methods. The separate retry verification script used its own test configuration.

### 6.5 Exponential backoff

Exponential backoff increases the delay between repeated failures.

For example, with an initial delay of 1 second, a simplified sequence is:

```text
Attempt 1 fails
      |
      v
Wait approximately 1 second
      |
      v
Attempt 2 fails
      |
      v
Wait approximately 2 seconds
      |
      v
Attempt 3 fails
```

The precise behavior depends on the configured backoff strategy and queue implementation.

The objective is to avoid repeatedly retrying a failing dependency at full speed.

### 6.6 Why errors must propagate

The email processor must not swallow a delivery error and return success.

Incorrect behavior:

```text
Email delivery fails
       |
       v
Error is swallowed
       |
       v
Job appears completed
```

Correct behavior:

```text
Email delivery fails
       |
       v
Error propagates
       |
       v
BullMQ records the failed attempt
       |
       v
Configured retry policy applies
```

The processor's unit tests include a case verifying that email failures propagate so BullMQ can retry.

---

## 7. Dedicated Worker Process

### 7.1 Why a separate worker exists

A dedicated worker can execute background jobs independently of the GraphQL API process.

This separation is useful because:

- API requests should not wait for email delivery.
- Background work can be scaled independently.
- Worker restarts need not require the API to restart.
- Worker logs can be inspected separately.
- Background jobs can continue to be processed while the API is temporarily unavailable, provided the worker and its dependencies remain healthy.

### 7.2 Worker entry point

The worker entry point is:

```text
src/worker.ts
```

The compiled entry point is:

```text
dist/worker.js
```

The verified direct startup command was:

```bash
node dist/worker.js
```

The intended package-script command is:

```bash
pnpm run start:worker
```

However, `pnpm` was unavailable in one of the terminals during this session. The direct Node command was used successfully instead.

This was an environment/tooling issue; it did not prevent the compiled worker from running.

### 7.3 Worker module

The worker module imports the necessary dependencies:

- `QueuesModule`
- `PrismaModule`
- `EmailModule`
- `TaskRemindersModule`

It also registers:

- `QueuesProcessor`
- `OutboxDispatcherService`

The module loads and validates environment configuration.

The worker bootstraps a NestJS application context, registers signal handlers and closes the application context on `SIGINT` or `SIGTERM`.

### 7.4 Graceful shutdown

Graceful shutdown allows the worker to close its resources in an orderly manner.

The application registers handlers for:

```text
SIGINT
SIGTERM
```

These handlers close the Nest application context, allowing providers to execute their cleanup hooks.

Graceful shutdown is particularly useful when restarting a worker during development or deploying a new version.

It should not be confused with guaranteed completion of every job under every possible shutdown scenario. Forced termination and infrastructure failures still require queue recovery behavior.

---

## 8. Redis Persistence and Health

The development Redis container was named:

```text
redis-cache
```

Redis health was verified using:

```bash
docker exec redis-cache redis-cli ping
```

Expected response:

```text
PONG
```

The environment reported Redis 7.4.11.

The Redis configuration also showed:

```text
appendonly yes
```

and configured RDB save rules.

### Why persistence matters

Redis persistence can reduce the risk of losing queue data during certain restarts.

However, persistence settings alone do not prove that every possible failure will preserve every job.

Actual durability depends on factors including:

- Redis persistence mode.
- Storage configuration.
- Failure timing.
- Filesystem behavior.
- Recovery procedures.
- BullMQ job state and retry configuration.

For Week 06B, we separately tested recovery of a waiting job after starting the worker again.

---

## 9. Runtime Verification: Worker Restart Recovery

### Objective

Verify that a job waiting in Redis can be processed after the worker starts.

### Test procedure

1. Stop the worker.
2. Create a job directly in BullMQ.
3. Confirm that the job is waiting.
4. Start the compiled worker.
5. Observe the worker processing the job.
6. Read the final job state from BullMQ.

The isolated test job was:

```text
Job ID:
recovery-final-5d09746f-1515-426e-a4f7-a5dc570adb03
```

Its message was:

```text
recovery-final-783a14eb-7271-4ad2-8767-1f017abdb8c3
```

Before the worker started, the job was in the:

```text
waiting
```

state.

After the worker started, the logs confirmed that the job was processed.

The final observed state was:

```json
{
  "id": "recovery-final-5d09746f-1515-426e-a4f7-a5dc570adb03",
  "state": "completed",
  "attemptsMade": 1,
  "failedReason": null
}
```

### Conclusion

**Worker restart recovery passed for this test scenario.**

This verifies that a waiting job persisted in Redis was processed after the worker started again.

It does not, by itself, prove recovery from every possible crash point, such as a worker dying halfway through a long-running job.

---

## 10. Runtime Verification: Actual Reminder Delivery

### Objective

Verify the reminder workflow beyond unit tests.

### Observed results

The test reminder email was received in the configured test inbox.

The reminder record reached:

```text
SENT
```

The associated BullMQ job reached:

```text
completed
```

The recorded error value was:

```text
lastError: null
```

### Conclusion

The tested reminder workflow successfully completed its email-delivery path in the development environment.

The evidence includes the received email and the associated persisted reminder and queue states.

This is stronger than merely verifying that a function was called in a unit test.

---

## 11. Runtime Verification: BullMQ Retries

### Objective

Verify that BullMQ retries a failed job and eventually completes it when a later attempt succeeds.

### Test design

A unique temporary queue was created for the test.

The worker intentionally threw an error during the first two attempts, then returned a successful result on the third attempt.

The test used:

```javascript
attempts: 3,
backoff: {
  type: 'exponential',
  delay: 100,
},
removeOnComplete: false,
removeOnFail: false,
```

The unique queue ensured that the test did not use the primary `taskforge` queue.

### Initial test-script problem

The first test run produced:

```json
{
  "state": "completed",
  "attemptsMade": 0,
  "result": {
    "result": "success",
    "attempts": 3
  },
  "retryTestPassed": false
}
```

The worker had visibly executed three attempts, but the script read the attempt count from an original in-memory job object.

That object did not reflect the final persisted attempt count.

This was a verification-script issue, not evidence that the retries had failed.

### Corrected test

The corrected script fetched the completed job again from Redis:

```javascript
const persistedJob = await queue.getJob(jobId);

const state = await persistedJob.getState();
```

It then read:

```javascript
persistedJob.attemptsMade
```

This ensured that the final report used a freshly fetched job object rather than the stale object.

### Final result

```json
{
  "jobId": "retry-verify-35662772-fc73-439b-9fc0-07f4968e1974",
  "state": "completed",
  "attemptsMade": 3,
  "result": {
    "result": "success",
    "successfulAttempt": 3
  },
  "retryTestPassed": true
}
```

### Conclusion

**The isolated retry test passed.**

Verified behavior:

- Attempt 1 failed intentionally.
- Attempt 2 failed intentionally.
- Attempt 3 succeeded.
- Redis reported the job as completed.
- The persisted attempt count was 3.
- The test's final pass flag was true.

The test's temporary queue was configured for cleanup after completion.

---

## 12. Existing Failed Jobs: Important Debugging Note

During the Week 06B checks, two old failed jobs were observed in the primary queue.

Both had:

```text
Job type: retry-test
```

The processor did not support that job type, so the jobs failed with:

```text
Unknown job type: retry-test
```

Both had exhausted three attempts.

These jobs were not evidence of Redis failure or of the isolated retry test failing.

They were caused by an unsupported job name.

The jobs were deliberately left untouched.

### General lesson

A failed job must be diagnosed before it is retried or deleted.

Check:

1. The job name.
2. Whether the processor supports that name.
3. The payload shape.
4. The recorded failure reason.
5. The number of attempts.
6. Whether retrying is safe.
7. Whether the job has already produced side effects.

Do not delete or replay failed jobs indiscriminately. Retrying a job that sends an email or changes business data can produce duplicate effects if the handler is not idempotent.

---

## 13. Testing and Code Quality

The recorded final quality checks were:

| Check | Result |
|---|---|
| Lint | Passed with zero warnings/errors |
| Vitest | 29 test files, 528 tests passed |
| Production build | Successful |
| SMTP smoke test | Actual email received |
| Reminder persistence | `SENT` verified |
| Worker restart recovery | Passed |
| BullMQ retry execution | Passed |
| Persisted retry count | Verified as 3 |

### Unit testing versus runtime testing

These tests serve different purposes.

**Unit tests** verify behavior of individual components, often using mocks or controlled dependencies.

**Runtime tests** verify that components work together in the actual development environment.

For example:

- A mocked email test verifies that the processor handles success or failure correctly.
- An actual SMTP smoke test verifies that the configured email provider can deliver a message.
- A BullMQ unit test verifies configured retry behavior at the component level.
- The isolated retry test verifies real BullMQ attempts and the persisted final attempt count.
- The restart recovery test verifies that a waiting job is processed after the worker starts.

Passing one category does not automatically imply that every other category has passed.

---

## 14. Git and Repository State

### Final implementation commit

```text
dfa7bd8 feat: add task deadline reminders and transactional outbox
```

The commit was pushed successfully to:

```text
origin/main
```

The successful push output showed:

```text
e486d24..dfa7bd8  main -> main
```

The subsequent `git status` check reported:

```text
On branch main
Your branch is ahead of 'origin/main' by 1 commit.
nothing to commit, working tree clean
```

That status was observed before the push.

After the push, the successful Git output confirmed that the local `main` commit was published to the remote branch.

The later retry verification script was a temporary runtime test and did not intentionally change application source files.

If an exact current repository status is needed, verify it with:

```bash
cd ~/Documents/TaskForge/work-bench/backend

git status
git log -1 --oneline
```

The last directly observed application commit remains `dfa7bd8`.

---

## 15. Important Files and Components

The following paths were identified during Week 06B.

| Path | Purpose |
|---|---|
| `src/worker.ts` | Background worker entry point |
| `dist/worker.js` | Compiled worker entry point |
| `src/queues/queues.service.ts` | Queue job creation methods |
| `src/queues/queues.processor.spec.ts` | Queue processor tests, including email failure propagation |
| `src/queues/queues.service.spec.ts` | Queue service tests, including retry/backoff defaults |
| `scripts/e2e-phase2.mjs` | Existing Phase 2 HTTP end-to-end test script |
| `.env` | Local environment configuration; must remain secret and untracked |

The exact source paths for the Outbox dispatcher and reminder scheduler should be confirmed from the current repository if a later task requires modifying those components.

Known class names include:

```text
OutboxDispatcherService
TaskReminderSchedulerService
QueuesProcessor
```

The worker module includes the Outbox dispatcher and reminder-related module dependencies.

---

## 16. Environment and Development Notes

### Runtime

The development environment used Node.js:

```text
v22.22.1
```

The observed Redis container was:

```text
redis-cache
```

The primary queue name was:

```text
taskforge
```

### `pnpm` availability

The intended worker startup script was:

```bash
pnpm run start:worker
```

However, a terminal session reported:

```text
pnpm: command not found
```

The compiled worker was successfully started directly using:

```bash
node dist/worker.js
```

If `pnpm` is unavailable in a future session, inspect the package scripts and Corepack setup before modifying the application.

Do not change package versions or dependency configuration merely to work around a shell-specific PATH problem without first understanding the environment.

### Worker lifecycle

A NestJS worker context starts background services as part of initialization.

Repeatedly starting multiple worker contexts can unintentionally create multiple scheduler or dispatcher instances.

Before starting another worker during development, check whether an existing worker is still running.

---

## 17. What Week 06B Does Not Prove

The completed tests establish the observed behavior in the tested environment. They do not prove that every production failure scenario has been handled.

The following areas may still require dedicated testing or design work in future phases:

1. Worker termination during an active long-running job.
2. Redis outages during dispatch.
3. Database outages during event processing.
4. Duplicate Outbox dispatch after a crash between queue publication and database acknowledgement.
5. Duplicate email prevention across all retry and replay scenarios.
6. SMTP rate limits and provider rejection.
7. Large queue backlogs and throughput limits.
8. Scheduler behavior under sustained database failures.
9. Metrics, alerting and operational dashboards.
10. Graceful shutdown while jobs are actively executing.
11. Recovery procedures for poison messages.
12. End-to-end idempotency across all business event handlers.

These are future reliability considerations, not evidence that the completed Week 06B work failed.

---

## 18. Week 06B Final Acceptance Checklist

### Implementation

- [x] Transactional Outbox implemented.
- [x] Outbox dispatcher integrated into the worker module.
- [x] Task deadline reminder scheduling implemented.
- [x] SMTP reminder delivery configured.
- [x] BullMQ job processor supports the intended job types.
- [x] Queue retries and backoff configured.
- [x] Worker bootstrap and shutdown handlers implemented.

### Verification

- [x] Lint passed.
- [x] 528 unit tests passed.
- [x] Production build succeeded.
- [x] Real reminder email received.
- [x] Reminder status persisted as `SENT`.
- [x] BullMQ job completion verified.
- [x] Waiting-job recovery after worker startup verified.
- [x] Three-attempt retry behavior verified.
- [x] Persisted retry attempt count verified.
- [x] Temporary retry queue cleanup executed.

### Delivery

- [x] Implementation committed.
- [x] Commit pushed to `origin/main`.
- [x] Latest directly observed application commit: `dfa7bd8`.

---

## 19. Final Summary

Week 06B added and verified a background-processing workflow that combines durable event recording, periodic deadline discovery, BullMQ job processing and actual SMTP delivery.

The most important engineering lessons are:

1. **Transactional Outbox:** Record business changes and their events in one database transaction.
2. **Eventual dispatch:** Deliver recorded events to the queue independently of the original request.
3. **Retries:** Transient failures should not immediately cause permanent job loss.
4. **Exponential backoff:** Space out repeated attempts to reduce pressure on failing dependencies.
5. **Idempotency:** Design handlers to tolerate duplicate delivery rather than assuming exactly-once execution.
6. **Worker recovery:** Verify behavior after a worker stops and starts again.
7. **Persisted verification:** Read final job state from Redis instead of relying on stale in-memory objects.
8. **Real integration testing:** Actual SMTP delivery proves more than a mocked email call.
9. **Operational discipline:** Investigate unsupported job types and failed jobs before replaying or deleting them.
10. **Honest acceptance criteria:** Distinguish what was directly verified from what still requires dedicated production testing.

### Week 06B status

**COMPLETE — the planned implementation, quality checks, runtime recovery test, retry verification and GitHub push are finished.**

The next activity is Phase 3 planning and architecture review. Implementation should begin only after the scope and day-wise plan have been discussed and explicitly approved.