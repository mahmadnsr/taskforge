# TaskForge / Work-Bench

TaskForge is a multi-tenant team task application. An organization admin creates a workspace, invites managers and employees, assigns people to projects, and follows work from tasks through subtasks, checklists, comments, notifications, and analytics. The frontend displays the product as Work-Bench.

## Features

- Organization registration, invitation email delivery, and invitation acceptance.
- ADMIN, MANAGER, and EMPLOYEE roles with organization and project membership checks.
- Projects, project members, tasks, one-level subtasks, checklists, comments, and activity history.
- Task assignment, guarded status transitions, soft deletion, and due date reminders.
- Dashboard summaries, task and project progress, project health, and employee workload analytics.
- Persisted in-app notifications with a live SSE update stream and read state, plus background email delivery.
- Same-project task dependencies with cycle prevention and blocked-work checks.

## Stack and architecture

| Layer           | Implementation                                       |
| --------------- | ---------------------------------------------------- |
| UI              | React, TypeScript, Vite, Apollo Client, Tailwind CSS |
| API             | NestJS, GraphQL/Apollo, Prisma                       |
| Data            | PostgreSQL                                           |
| Background work | Redis, BullMQ, separate NestJS worker                |
| Email           | SMTP; Mailpit in isolated local staging              |

The browser calls the GraphQL API. Prisma stores application data in PostgreSQL. API transactions record task events in an outbox; a worker dispatches those events to BullMQ through Redis. The worker also handles email jobs, reminders, and a health heartbeat. See [the architecture guide](docs/architecture.md) for the data flow and diagram.

## Authentication and access

Registration creates a user and an organization with an ADMIN membership. Only ADMIN can invite MANAGER and EMPLOYEE organization members. An ADMIN appoints a project manager by adding that MANAGER to the Project Team; this MVP has no separate primary-manager field. A MANAGER can add or remove existing organization EMPLOYEEs on an authorized project's team and assign tasks only to those project employees. ADMIN can manage project teams and assign tasks to project members of any organization role. EMPLOYEEs cannot invite members, manage project teams, create tasks, or assign tasks; they can advance their own assigned tasks and complete assigned checklist items. Removing a project member with assigned tasks requires reassignment first.

Passwords are hashed, access uses JWTs, and refresh tokens are stored as hashes and rotated. Protected GraphQL operations check the caller's organization membership; non-admin project and task access also checks project membership. The backend enforces these rules independently of UI controls.

Every project, task, subtask, checklist item, comment, notification, and activity record is scoped to an organization. Service queries apply organization and, where required, project access checks. Database constraints reinforce subtask organization/project consistency and a single subtask level.

Assigned employees can move work from TODO to IN_PROGRESS and submit it as IN_REVIEW. An ADMIN or project-authorized MANAGER approves submitted work as DONE or returns it to IN_PROGRESS for changes. Review decisions create activity records and notify the assignee. Status writes use a conditional update so competing review decisions cannot both succeed.

## Progress and analytics

A DONE task is 100% complete. Otherwise, progress averages the completion percentages of its nonempty checklist and direct subtasks; a task with neither is 0%. Project progress averages its nondeleted root tasks. Project analytics includes status distribution, overdue work, member workload, recent activity, and health. Employee analytics counts assigned/completed work and completion timing when due date history permits it. Dashboard counts root tasks rather than double-counting subtasks.

## Database and background work

Prisma models users, hashed refresh tokens, organizations/members/invitations, projects/members, tasks/subtasks/checklists/activity/comments, notifications, reminders, and outbox events. SQL migrations live in `backend/prisma/migrations/` and must be applied in order. Soft deletion retains task audit history.

Task mutations write outbox events in the same PostgreSQL transaction as task changes. The dispatcher reads pending events and enqueues BullMQ jobs; this avoids reporting a successful task change while silently losing its event during an API failure. Redis carries the queue, while the separate worker processes task events and SMTP email jobs. Reminder scheduling records notification and email state and uses idempotency/claim checks to reduce duplicate sends.

## Observability

The API and worker write newline-delimited structured JSON logs to stdout/stderr.
Every record contains a timestamp, severity, process, component, and event name.
HTTP and GraphQL logs also include a validated or generated `x-request-id`; the
same ID is returned in the response header. Log serialization redacts secret
keys and common credential formats and never records GraphQL variables or job
payloads.

`GET /metrics` exports Prometheus-compatible, in-process HTTP and GraphQL
request/error/duration metrics, bounded-window p50/p95 values, BullMQ queue
state and Redis connectivity, plus a single pending-outbox aggregate. The
endpoint requires `Authorization: Bearer <METRICS_ACCESS_TOKEN>` and remains
closed when the token is absent. Labels are deliberately limited to HTTP
method, normalized route, status class, GraphQL operation type, and queue
state. The p50/p95 gauges use the nearest-rank values from the latest 1,024
durations for each label set, reset on process restart, and are not
mergeable across API replicas. Long-lived notification SSE connections are
counted as HTTP requests but excluded from HTTP latency histograms and p50/p95.
Queue/outbox snapshots are cached for five seconds per API process and
concurrent scrapes share one collection attempt. Health endpoints remain
separate: `/health/live` checks only the API
process, `/health/ready` checks PostgreSQL and Redis, and `/health/worker`
reports the worker heartbeat without infrastructure details.

## Local setup

Prerequisites: Node.js 22, pnpm 10.34.5, PostgreSQL, Redis, and an SMTP sink such as Mailpit. Use only local development credentials. Create your own `backend/.env` from `backend/.env.example`; never commit it. Set the API database URLs and Redis/SMTP connection details, then run:

```bash
cd backend
pnpm install --frozen-lockfile
pnpm exec prisma generate
pnpm exec prisma migrate deploy
pnpm start:dev
```

In separate terminals, run the worker and frontend:

```bash
cd backend && pnpm start:worker:dev
cd frontend && pnpm install --frozen-lockfile && pnpm dev
```

Set the frontend `VITE_GRAPHQL_URL` to the local GraphQL endpoint if the default `http://localhost:3000/graphql` is unsuitable. The worker uses the same backend environment. The root `docker-compose.yml` is a separate development stack; review its port and credential defaults before starting it. For the tested isolated Docker setup, follow [staging/README.md](staging/README.md). Its generated state and three data volumes are separate from the root stack, and its API, UI, and Mailpit ports bind only to loopback.

## Environment variables

Configure these in your own ignored environment file or deployment secret store. This table intentionally contains no credential values.

| Variable                                                                    | Purpose                                                                 |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED`                                     | Prisma PostgreSQL connections                                           |
| `JWT_ACCESS_SECRET`, `JWT_ACCESS_EXPIRES_IN`                                | JWT signing and access lifetime                                         |
| `REFRESH_TOKEN_TTL_DAYS`                                                    | Refresh lifetime                                                        |
| `METRICS_ACCESS_TOKEN`                                                      | Separate bearer token protecting `GET /metrics`; required in production |
| `NODE_ENV`, `PORT`                                                          | Runtime mode and API port                                               |
| `CORS_ORIGINS`, `FRONTEND_URL`                                              | Browser origins and invitation link base                                |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD`, `REDIS_TLS` | Queue connection                                                        |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`             | Email delivery                                                          |
| `TRUST_PROXY`                                                               | Trusted reverse proxy addresses, when applicable                        |
| `VITE_GRAPHQL_URL`                                                          | GraphQL URL compiled into the frontend                                  |

See `backend/.env.example` for variable descriptions. Never reuse local/staging secrets for a deployed environment.

## Tests and checks

```bash
cd backend && pnpm exec vitest run --exclude '**/*.integration.spec.ts'
cd backend && pnpm build
cd frontend && pnpm test && pnpm build
```

Backend HTTP integration tests bind local ports and can run with `pnpm exec vitest run src/common/graphql/format-error.integration.spec.ts src/common/guards/gql-throttler.guard.integration.spec.ts` from `backend/`. Database/Redis integration tests need their dedicated local fixtures. With isolated staging running, run `bash staging/stage.sh test --approve-local-target`, `bash staging/stage.sh smoke --approve-local-target`, `node staging/validate-frontend-graphql.mjs`, and `node staging/functional-qa.e2e.mjs`. The last script creates fresh test records and uses Mailpit; it does not reset the database. A desktop/mobile browser pass is still needed for visual verification.

## Screenshots

Screenshots are pending. Add redacted desktop and mobile images of the dashboard, project/task views, analytics, and invitation flow before publication. Do not include real account details or invitation links.

## Security considerations

Keep all `.env` files and `staging/.state/` out of Git and Docker build contexts. Treat invitation links, JWTs, and refresh tokens as secrets. Use HTTPS, restrictive CORS, trusted proxy settings, durable PostgreSQL/Redis, and an SMTP provider in a deployment. The local staging environment verifies behavior on an empty database; test migrations on sanitized representative data before any production rollout.

## Future improvements

- Add browser automation for desktop/mobile interaction and accessibility checks.
- Add representative-data migration tests and a dedicated CI service stack for database/Redis integration.
- Add redacted product screenshots and deployment-specific operations guidance.
