# Isolated local staging

This stack is separate from the repository's root Compose stack. It uses the fixed
Compose project `taskforge_interview_stage`, a dedicated PostgreSQL database,
dedicated Redis and Mailpit, and three project-scoped volumes. PostgreSQL,
Redis, and Mailpit SMTP have no
published ports. Only the app is exposed on loopback: API `127.0.0.1:3300` and
frontend `127.0.0.1:8088`; the Mailpit inbox is at `127.0.0.1:8025`. The generated staging environment is kept in the
ignored `staging/.state/` directory with owner-only permissions; do not copy
production credentials there. Docker administrators can still inspect container
environment values, so use this stack only on a trusted local Docker host.

The wrapper rejects nonlocal Docker contexts and checks that both Prisma URLs
point to `postgres:5432/taskforge_stage` with the locally generated password.
It never accepts a database URL from the command line or shell environment.
The first service start refuses to adopt pre-existing staging containers or
volumes, protecting any data already under that project name.
Do not invoke these commands until the local target and command sequence have
been approved.

## Commands, in order

From the repository root:

`init` and `configure-mailpit` have already been run in this workspace. They
refuse to overwrite the generated configuration. For this workspace, begin
with `target`; on a fresh clone, begin with `init`.

```bash
bash staging/stage.sh init
bash staging/stage.sh target
bash staging/stage.sh build --approve-local-target
bash staging/stage.sh start-services --approve-local-target
bash staging/stage.sh status --approve-local-target
bash staging/stage.sh migrate --approve-local-target
bash staging/stage.sh history --approve-local-target
bash staging/stage.sh constraints --approve-local-target
bash staging/stage.sh test --approve-local-target
bash staging/stage.sh start-app --approve-local-target
bash staging/stage.sh smoke --approve-local-target
bash staging/stage.sh invitation-e2e --approve-local-target
node staging/validate-frontend-graphql.mjs
node staging/functional-qa.e2e.mjs
```

`status` may exit nonzero while migrations are pending. On a brand-new empty
database, `migrate` applies **all** repository migrations in timestamp order;
the final two are `20261119145513_add_subtasks_checklists_activity` and
`20261120000000_enforce_task_subtask_integrity`. The migration tool image is
rebuilt immediately before deployment, so the latest migration directories
are included. `history` lists the recorded migration
names and completion state. `start-app` refuses to run while Prisma reports
pending migrations.

`constraints` asserts the composite parent foreign key, one-level trigger,
activity retention foreign key, and pagination index. It attempts forbidden
cross-project, cross-organization, and third-level inserts, then verifies
activity survives soft deletion and blocks hard deletion. Its fixtures are
wrapped in a transaction that ends with `ROLLBACK`.

`test` runs the PostgreSQL/Redis reminder integration test against these
containers. The auth database integration test is excluded because it has a
hardcoded `localhost:5433/taskforge_auth_test` safety guard. After `start-app`,
`smoke` checks API readiness, PostgreSQL, Redis, worker heartbeat and Docker
health, GraphQL task operations, and frontend HTML. Then
use the browser at `http://127.0.0.1:8088` to exercise registration, project and
task creation, subtasks, checklists, activity history, and reminders. No SMTP
service is exposed to the host. Invitations and other staging email go to
Mailpit at `http://127.0.0.1:8025`. The `invitation-e2e` command creates a
fresh staging organization and employee, verifies delivery and the invitation
link, opens the frontend route, accepts the invite through registration, and
checks the employee membership. Its test records remain in the staging database.
`validate-frontend-graphql.mjs` checks frontend operations against the live
staging schema. `functional-qa.e2e.mjs` creates unique local test accounts and
exercises the full API workflow, analytics, and authorization boundaries; its
test records also remain in the staging database. These scripts verify HTTP/API
behavior and do not perform browser interaction.
The staging Nginx configuration disables access logs so invitation tokens in
the URL are not written there.

This empty staging database verifies clean migration and runtime behavior. It
cannot prove compatibility with existing production rows. Before production,
test the same migrations on an isolated, sanitized copy of representative data
and review any hierarchy violations. Do not repoint this stack at Neon.
