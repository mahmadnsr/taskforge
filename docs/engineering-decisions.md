# Engineering Decisions

This document explains the architectural choices and
trade-offs behind TaskForge.

## 1. Modular Monolith

Decision: Use a modular NestJS API with a separate
background worker instead of independent microservices.

Rationale: Maintain clear domain boundaries without
introducing unnecessary distributed-system complexity.

Trade-off: API modules share a deployment lifecycle.

## 2. PostgreSQL

Decision: Use a relational database as the authoritative
source of application data.

Rationale: Organizations, memberships, projects, tasks,
and dependencies require strong relational integrity
and transactional consistency.

Trade-off: Schema evolution requires careful migrations.

## 3. GraphQL

Decision: Expose application operations through GraphQL.

Rationale: Typed contracts and flexible field selection
support complex workspace views.

Trade-off: Authorization, query complexity, and error
handling require explicit controls.

## 4. Multi-Tenant Authorization

Decision: Combine organization roles, project membership,
service-level authorization, and database constraints.

Rationale: Authentication alone cannot guarantee tenant
isolation or permission to access individual resources.

Trade-off: Authorization logic must remain consistent
across all resource operations.

## 5. Redis and BullMQ

Decision: Process asynchronous workloads through a
separate worker backed by Redis and BullMQ.

Rationale: Email, reminders, and task-event processing
should not unnecessarily delay synchronous API requests.

Trade-off: Queue infrastructure introduces additional
operational dependencies and failure scenarios.

## 6. Transactional Outbox

Decision: Persist business events within the same
database transaction as their corresponding changes.

Rationale: Reduce the risk of losing events between
a successful database commit and queue publication.

Trade-off: Event delivery is asynchronous and requires
retry, recovery, and idempotency mechanisms.

## 7. Server-Sent Events

Decision: Use SSE for live notification change signals.

Rationale: Notifications primarily require one-way
server-to-client communication.

Trade-off: Persistent connections require reconnect
handling, authorization, and infrastructure support.

## 8. Soft Deletion

Decision: Retain deleted task records and activity history.

Rationale: Preserve historical information and auditability.

Trade-off: Normal queries must consistently exclude
soft-deleted records.

## 9. Concurrency Control

Decision: Use transactions, conditional updates, and
project-level locking where consistency requires them.

Rationale: Prevent competing review decisions and
inconsistent dependency graph modifications.

Trade-off: Lock contention can reduce concurrency
under competing writes.

## 10. Observability

Decision: Provide structured logs, request correlation,
protected metrics, and separate health endpoints.

Rationale: Improve failure diagnosis without exposing
credentials or tenant-specific metric labels.

Trade-off: Process-local metrics reset on restart and
some percentile measurements cannot be merged across replicas.

## 11. Isolated Staging

Decision: Maintain a dedicated local Docker environment.

Rationale: Verify migrations, authorization, background
processing, and failure recovery without production access.

Trade-off: An empty staging database cannot establish
migration compatibility with existing production data.
