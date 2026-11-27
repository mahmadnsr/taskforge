# Testing and Release Verification

TaskForge combines fast unit tests, self-contained HTTP integration tests,
service-backed database/queue tests, guarded local staging, and manual browser
checks. Tests must use disposable or explicitly isolated resources; never point
them at production, Neon, or a shared database.

## Local checks

Install with the committed lockfiles using Node.js 22 and pnpm 10.34.5.

```bash
(cd backend && pnpm install --frozen-lockfile)
(cd frontend && pnpm install --frozen-lockfile)

(cd backend && pnpm exec prisma generate)
(cd backend && pnpm exec prisma validate)
(cd backend && pnpm lint && pnpm build)
(cd backend && pnpm exec vitest run --exclude 'src/auth/token.service.integration.spec.ts' --exclude 'src/task-reminders/task-reminder.integration.spec.ts')

(cd frontend && pnpm exec tsc -b --pretty false)
(cd frontend && pnpm lint && pnpm test && pnpm build)

git diff --check
```

The backend Nest build performs the production TypeScript compilation. The
frontend runs an explicit TypeScript project build before its Vite production
build. Backend lint currently reports configured warnings without converting
them into errors; CI preserves the repository's lint policy.

## Test layers

- Backend unit tests cover services, guards, resolvers, validation, error
  filtering, queues, health, monitoring, and concurrency behavior.
- Self-contained backend integration tests start local Nest/Apollo listeners to
  verify production error formatting and throttling. They need permission to
  bind ephemeral loopback ports.
- PostgreSQL integration verifies atomic refresh-token rotation and rollback.
  PostgreSQL/Redis integration verifies reminder persistence and real BullMQ
  enqueueing. SMTP integration uses an isolated mail sink.
- Frontend Vitest/Testing Library tests cover routing, auth-aware navigation,
  refresh concurrency, stale-session rejection, logout races, SSE reconnect,
  theme persistence, layouts, and key workspace views.
- Staging scripts exercise the compiled services, schema, authorization,
  invitations, task workflows, notifications, recovery, and browser smoke.

## Continuous integration

The [GitHub Actions workflow](../.github/workflows/ci.yml) runs for pushes to
`main`, `dev`, `develop`, `development`, and the `feature/**`, `fix/**`,
`test/**`, and `ui/**` branch families, plus pull requests targeting `main`.
Newer runs cancel superseded runs for the same branch or pull request.

CI uses separate frozen backend/frontend installs and pnpm caches. It runs:

- backend Prisma generation and runtime-resolution verification, lint, unit and
  self-contained integration tests, and a type-checked production build;
- frontend lint, TypeScript checking, tests, and a production build; and
- backend migrations plus refresh-token and reminder integration tests against
  disposable PostgreSQL and Redis service containers.

Jobs use read-only repository permissions and bounded timeouts. There are no
deployment steps. The real SMTP test, full staging flows, and browser smoke are
not run in GitHub Actions.

## Isolated staging

Follow the [staging guide](../staging/README.md). Its wrapper validates a fixed
local Docker context, project name, generated credentials, database name, and
owner-only state files before running stateful commands. The principal sequence
is:

```bash
bash staging/stage.sh target
bash staging/stage.sh build --approve-local-target
bash staging/stage.sh start-services --approve-local-target
bash staging/stage.sh migrate --approve-local-target
bash staging/stage.sh history --approve-local-target
bash staging/stage.sh constraints --approve-local-target
bash staging/stage.sh test --approve-local-target
bash staging/stage.sh start-app --approve-local-target
bash staging/stage.sh smoke --approve-local-target
bash staging/stage.sh invitation-e2e --approve-local-target
node staging/validate-frontend-graphql.mjs
node staging/functional-qa.e2e.mjs
node staging/browser-smoke.mjs
node staging/reliability-qa.mjs
```

Some scripts leave uniquely named fixtures in the isolated staging database.
The stack validates an empty-database migration path; migration compatibility
with existing rows must be tested separately on a sanitized representative
copy. Performance scripts are optional engineering checks and their historical
results are documented in [performance.md](performance.md).

## Manual release checks

- Inspect changed and untracked files; check that no credentials, temporary
  artifacts, debug code, or unintended dependencies are included.
- Verify migration status, constraints, API readiness, worker heartbeat, Redis,
  SMTP/Mailpit, protected metrics, and outbox recovery.
- Exercise registration/login, organization selection, authorization denial,
  refresh/session expiry, logout, invalid routes, invitations, projects, tasks,
  dependencies, reviews, notifications, and analytics with safe fixtures.
- Check the built frontend in light and dark themes at mobile and desktop sizes,
  including keyboard focus, responsive navigation, loading/error/empty states,
  favicon, titles, and reduced motion.
- Review rollback prerequisites and confirm a tested database backup exists
  before a real deployment.

Current limitations: browser automation and real SMTP are release checks rather
than CI gates, and no test suite alone establishes complete accessibility,
security, or production readiness.
