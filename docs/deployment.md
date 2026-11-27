# Secure Deployment Guide

This document describes a production-oriented deployment model for the current
repository. It does not assert that a production deployment exists. The root
Compose file is a loopback-bound development stack; the guarded staging stack
is for local verification, not a production template.

## Architecture

Deploy the static frontend behind an HTTPS-capable web server or CDN. Route API,
GraphQL, SSE, health, and protected metrics traffic to the Nest API. Run the
worker as a separate long-lived process from the same backend artifact. Both API
and worker need PostgreSQL and Redis connectivity; the worker also sends email
through SMTP.

PostgreSQL is authoritative. Redis carries BullMQ jobs, cache state, and worker
heartbeats. Losing Redis can delay work, but business records and the
transactional outbox remain in PostgreSQL for recovery.

## Configuration

Use a deployment secret manager. Do not commit environment files or copy local
staging credentials.

| Variable | Runtime purpose |
| --- | --- |
| `NODE_ENV=production`, `PORT` | Production validation and API listener |
| `DATABASE_URL` | Application PostgreSQL connection |
| `DATABASE_URL_UNPOOLED` | Direct PostgreSQL connection used by Prisma migrations |
| `JWT_ACCESS_SECRET` | Independent JWT signing secret, at least 32 characters |
| `JWT_ACCESS_EXPIRES_IN` | Access-token lifetime; defaults to `15m` |
| `REFRESH_TOKEN_TTL_DAYS` | Refresh-token lifetime; defaults to 7 days |
| `METRICS_ACCESS_TOKEN` | Independent non-whitespace bearer token, at least 32 characters |
| `CORS_ORIGINS` | Comma-separated exact browser origins, without paths or trailing slashes |
| `FRONTEND_URL` | Public frontend origin used for invitation links |
| `REDIS_HOST`, `REDIS_PORT` | Redis endpoint |
| `REDIS_USERNAME`, `REDIS_PASSWORD`, `REDIS_TLS` | Managed Redis authentication and TLS when required |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Invitation and notification delivery |
| `TRUST_PROXY` | Explicit trusted proxy ranges; omit unless the proxy path is controlled |
| `VITE_GRAPHQL_URL` | Public GraphQL URL compiled into the frontend artifact |

The backend validates required values at startup. Production requires a metrics
token. Never set `TRUST_PROXY=true`; configure only known proxy hops or ranges.

## Network and TLS

- Terminate TLS at a trusted load balancer or web server and redirect HTTP to
  HTTPS. Encrypt upstream connections when traffic crosses an untrusted network.
- Keep PostgreSQL, Redis, worker, and SMTP management endpoints on private
  networks. Do not publish their ports to the internet.
- Restrict `/metrics` at the network layer as well as with its bearer token.
- Set `CORS_ORIGINS` to the deployed frontend origins. CORS is not an
  authorization boundary; backend authentication and tenant checks remain
  mandatory.
- Configure `TRUST_PROXY` only when the request path and forwarded headers are
  controlled. Rate limiting depends on correct client-address handling.

## Build and release sequence

1. Select an immutable commit and install each application with its committed
   lockfile using pnpm 10.34.5 and Node.js 22.
2. Generate Prisma Client, then run backend/frontend lint, tests, type checking,
   and production builds as described in [testing](testing.md).
3. Build immutable backend, worker, and frontend artifacts. Supply the final
   `VITE_GRAPHQL_URL` while building the frontend.
4. Back up PostgreSQL and verify the restore procedure. Test migrations first
   against an isolated, sanitized copy of representative data.
5. Run `pnpm exec prisma migrate status`, review every pending SQL migration,
   and apply it once with `pnpm exec prisma migrate deploy` using
   `DATABASE_URL_UNPOOLED`. Do not run `migrate dev` in a deployment.
6. Start or update the API and worker. Confirm readiness and worker heartbeat
   before shifting traffic or completing the rollout.
7. Run the release checks below and monitor logs, errors, queue depth, and
   pending outbox work.

Prisma migrations have no automatic down-migration workflow here. Prefer a
forward corrective migration. Roll back application artifacts only when the
deployed schema remains compatible. For a data restore, stop writers, follow a
tested database recovery procedure, and account for jobs and email side effects
before resuming service.

## Runtime services

Run at least one API process and one worker process. Give both graceful shutdown
time: the worker handles `SIGINT` and `SIGTERM` and closes its application
context. Configure durable PostgreSQL storage, connection limits, backups, and
retention appropriate to the hosting platform.

Use authenticated Redis and TLS where supported. Redis persistence and high
availability reduce delayed-job loss, but recovery must still reconcile the
PostgreSQL outbox. Configure SMTP with a verified sender and monitor rejected or
uncertain delivery outcomes; the worker intentionally avoids blind retries when
provider acceptance is ambiguous.

## Health and monitoring

| Endpoint | Meaning |
| --- | --- |
| `/health/live` | API process is running |
| `/health/ready` | PostgreSQL and Redis are reachable; returns failure when either is down |
| `/health/worker` | Worker heartbeat is active, unknown, or unavailable |
| `/metrics` | Bearer-protected Prometheus text metrics |

Use liveness only for process restart decisions and readiness for traffic
routing. Alert on readiness failures, missing worker heartbeat, authentication
and server errors, queue growth, exhausted outbox attempts, pending outbox work,
and uncertain email outcomes. Centralize structured JSON stdout/stderr logs and
retain `x-request-id` for correlation without recording credentials or payloads.

## Release verification

- Confirm CI completed for the selected commit and no migration is pending.
- Verify HTTPS, certificate validity, CORS, security headers, and expected
  trusted-proxy behavior.
- Verify registration/login or an approved existing test account, organization
  selection, protected-route rejection, refresh, logout, and session expiry.
- Exercise project/task changes, dependencies, reviews, notifications, and
  invitation email using nonproduction fixtures.
- Check API readiness, worker heartbeat, Redis queues, outbox recovery, SMTP,
  metrics authentication, and rollback prerequisites.
- Perform responsive light/dark browser checks against the built frontend.

The guarded [local staging guide](../staging/README.md) exercises clean
migrations and core workflows. It does not prove compatibility with existing
production rows or replace backup/restore testing.
