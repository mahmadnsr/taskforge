# Changelog

TaskForge has no published semantic versions or tagged release dates. This file
groups milestones supported by Git history and the current working tree without
assigning release numbers or dates.

## Unreleased

- Refined the public and authenticated frontend with responsive light/dark
  themes, TaskForge bee branding, accessible navigation, loading states, page
  titles, favicon, and a branded not-found route.
- Unified frontend refresh coordination across Apollo, authentication restore,
  and notification streaming; guarded against stale session responses and
  refresh/logout races; added focused regression coverage.
- Expanded CI branch coverage, cancellation, timeouts, frozen installs,
  frontend/backend validation, Prisma client verification, and disposable
  PostgreSQL/Redis integration services.
- Added release-facing architecture, database, performance, security,
  deployment, and testing documentation with product screenshots.

## Observability and operational hardening

- Added structured API/worker logs, request correlation, redaction, protected
  Prometheus metrics, dependency readiness, and worker heartbeat reporting.
- Hardened outbox dispatch, reminder claims, queue recovery, uncertain SMTP
  outcomes, and isolated staging reliability checks.
- Added query/index work and recorded reproducible historical benchmark
  methodology and results.

## Complete task workflows

- Added subtasks, checklists, task activity, dependencies with cycle checks,
  review/approval transitions, notifications, and analytics.
- Added responsive dashboard, projects, tasks, inbox, member management, and
  authentication-aware public navigation.
- Strengthened concurrency handling, organization scoping, project membership
  rules, pagination, and task integrity constraints.

## Background processing and notifications

- Added persisted notifications, SSE change signals, BullMQ processing, a
  transactional outbox, deadline reminders, SMTP delivery, and a separate
  worker process.
- Added PostgreSQL/Redis and SMTP integration coverage plus guarded local
  staging workflows.

## Core workspace

- Added organizations, invitations, role-based membership, projects, project
  teams, tasks, assignment and status workflows, comments, search, and cursor
  pagination.
- Added tenant-aware authorization in backend guards/services and composite
  database constraints.

## Foundation and security baseline

- Established NestJS GraphQL, Prisma/PostgreSQL, React/Vite, and Docker-based
  development structure.
- Added bcrypt login, JWT access tokens, hashed rotating refresh tokens,
  validation, Helmet, CORS allowlisting, rate limiting, and sanitized production
  GraphQL errors.
