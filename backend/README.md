# TaskForge — Backend

The backend of TaskForge is a modular, multi-tenant application built
with NestJS, TypeScript, GraphQL, PostgreSQL, Prisma, Redis and BullMQ.

It provides organization management, role-based authorization, project
management, task workflows, analytics, notifications and reliable
background processing.

## Technology Stack

| Technology | Purpose |
| --- | --- |
| NestJS | Modular backend architecture |
| TypeScript | Type-safe application development |
| GraphQL and Apollo | API layer |
| PostgreSQL | Relational data persistence |
| Prisma | Database access and migrations |
| Redis | Caching and queue infrastructure |
| BullMQ | Background job processing |
| JWT and bcrypt | Authentication and password security |
| Nodemailer | Email delivery |
| Vitest | Automated testing |
| Oxlint | Static code analysis |

## Backend Architecture

The application separates API request handling from asynchronous
background processing.

- The API handles GraphQL operations, authentication, authorization
  and business logic.
- PostgreSQL stores application data and transactional outbox events.
- Redis provides caching and BullMQ infrastructure.
- The background worker processes asynchronous jobs and task reminders.
- Server-Sent Events support real-time notification delivery.

See the [system architecture](../docs/architecture.md) for details.

## Module Structure

| Module | Responsibility |
| --- | --- |
| auth | Authentication and refresh-token rotation |
| users | User lookup and management |
| organizations | Organization membership, roles and invitations |
| projects | Project management and project-level access |
| tasks | Task workflows, subtasks, checklists and dependencies |
| task-comments | Task discussions and comment pagination |
| dashboard | Dashboard summaries and analytics |
| notifications | Persistent notifications and real-time delivery |
| task-reminders | Deadline reminders and processing lifecycle |
| outbox | Reliable asynchronous event delivery |
| queues | BullMQ queue infrastructure |
| cache | Redis-backed caching |
| email | Email delivery |
| prisma | Database access |
| config | Environment configuration and validation |
| common | Shared guards, utilities and GraphQL infrastructure |
| observability | Structured logging and application metrics |
| health | Application health endpoints |
| worker-heartbeat | Background worker health monitoring |

## Security

The backend includes:

- JWT-based authentication.
- Hashed refresh tokens with atomic rotation.
- Role-based and tenant-scoped authorization.
- Project-level access restrictions.
- Database constraints for tenant integrity.
- Request validation and sanitized error responses.
- Rate limiting, Helmet and restrictive CORS configuration.
- Protected metrics and sensitive-data redaction.

See the [security policy](../SECURITY.md) for security controls,
known limitations and vulnerability reporting.

## Local Development

Use an isolated local PostgreSQL and Redis environment.
Never run development tests or migrations against production databases.

From the backend directory:

### Install dependencies

    pnpm install --frozen-lockfile

### Generate Prisma Client

    pnpm exec prisma generate

### Start the API

    pnpm start:dev

### Start the background worker

    pnpm start:worker:dev

Configure the required environment variables before starting either process.

For the complete environment setup, follow the
[root README](../README.md) and [staging guide](../staging/README.md).

## Database

The database schema is maintained using Prisma migrations.

Tenant-scoped relationships and composite constraints help enforce
data integrity across organizations, projects and tasks.

- [Prisma schema](prisma/schema.prisma)
- [Database migrations](prisma/migrations/)
- [Database architecture](../docs/database.md)

Apply migrations only after verifying the target database and following
the appropriate backup and release procedures.

## Validation and Testing

### Static analysis

    pnpm lint

### Production build

    pnpm build

### Isolated unit and self-contained integration tests

    pnpm exec vitest run --exclude 'src/auth/token.service.integration.spec.ts' --exclude 'src/task-reminders/task-reminder.integration.spec.ts'

Database and queue integration tests require isolated infrastructure.
Use the [testing guide](../docs/testing.md) for the complete procedure.

## Production Processes

After building the application, the API and worker run as separate processes.

    pnpm start:prod

    pnpm start:worker

See the [deployment guide](../docs/deployment.md) for configuration,
migration safety and operational verification.

## Observability

TaskForge provides:

- Structured JSON logging.
- Request correlation.
- Protected Prometheus-compatible metrics.
- BullMQ lifecycle monitoring.
- Transactional outbox and queue health snapshots.
- API and worker health checks.

| Endpoint | Purpose |
| --- | --- |
| /health/live | API liveness |
| /health/ready | API readiness |
| /health/worker | Worker health |
| /metrics | Protected application metrics |

See the [root README](../README.md) for endpoint configuration,
metrics limitations and health semantics.

## Further Documentation

- [Engineering decisions](../docs/engineering-decisions.md)
- [Performance benchmarks](../docs/performance.md)
- [Testing and CI](../docs/testing.md)
- [Deployment](../docs/deployment.md)

## Framework Attribution

Built using [NestJS](https://nestjs.com/), an MIT-licensed framework
created by Kamil Myśliwiec and contributors.
