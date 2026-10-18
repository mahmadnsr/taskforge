# 📘 Week 3 — Day 2: Create Task + Task Queries

## 🎯 Goal

Implement the first usable Task APIs in TaskForge:
- Create a task inside an organization project.
- Fetch one task by ID.
- Fetch tasks belonging to a project.
- Enforce organization membership, project membership, and role-based access.
- Validate inputs and prevent cross-organization access.
- Test the service behavior.

> **Current status:** The Task module, resolver, DTOs, service, and service tests already exist. These notes document the implementation; do not recreate the module from scratch.

## 1. Architecture and request flow

```text
GraphQL client
    │
    ▼
TasksResolver  ← JwtAuthGuard authenticates the caller
    │
    ▼
TasksService   ← business rules, authorization, validation
    │
    ▼
PrismaService
    │
    ▼
PostgreSQL
```

| Layer | Responsibility |
|---|---|
| Resolver | Exposes GraphQL operations and passes the authenticated user ID to the service |
| DTO / GraphQL input | Defines accepted input fields and validation |
| GraphQL entity | Defines fields returned to GraphQL clients |
| Service | Applies authorization, validation, organization scoping, and business rules |
| Prisma schema | Defines relations, enums, indexes, and database integrity |
| Unit tests | Verify allowed and denied operations |

**Authentication vs authorization:** Authentication establishes who the caller is. Authorization decides whether that caller may access the requested resource. A valid JWT must not grant access to every task.

## 2. Task data model

| Field | Meaning |
|---|---|
| `id` | Unique task identifier |
| `organizationId` | Tenant/organization boundary |
| `projectId` | Project that owns the task |
| `title` | Task title |
| `description` | Optional details |
| `status` | Workflow state; defaults to `TODO` |
| `priority` | Priority; defaults to `MEDIUM` |
| `createdById` | User who created the task |
| `assigneeId` | Optional assigned user |
| `dueDate` | Optional deadline |
| `createdAt`, `updatedAt` | Timestamps |

```prisma
enum TaskStatus {
  TODO
  IN_PROGRESS
  IN_REVIEW
  DONE
}

enum TaskPriority {
  LOW
  MEDIUM
  HIGH
  URGENT
}
```

### Why is `organizationId` on Task?

TaskForge is multi-tenant. Users in one organization must not access another organization's data by guessing or obtaining an ID.

The database uses composite relations:
- Task `(projectId, organizationId)` → Project `(id, organizationId)`.
- Task `(createdById, organizationId)` → OrganizationMember `(userId, organizationId)`.
- Task `(projectId, assigneeId)` → ProjectMember `(projectId, userId)`.

Service-level authorization and database constraints are complementary. Foreign keys preserve data integrity; they do not replace access checks.

## 3. GraphQL API surface

The resolver exposes:

| Operation | Type | Purpose |
|---|---|---|
| `createTask` | Mutation | Create a task in a project |
| `task` | Query | Fetch one task |
| `projectTasks` | Query | List tasks for a project |

The resolver uses `JwtAuthGuard`. The creator identity comes from the authenticated user—not from an untrusted `createdById` supplied by the client.

### Illustrative GraphQL operation: create

```graphql
mutation CreateTask($input: CreateTaskInput!) {
  createTask(input: $input) {
    id
    title
    description
    status
    priority
    projectId
    organizationId
    createdById
    assigneeId
    dueDate
    createdAt
    updatedAt
  }
}
```

Illustrative variables (replace the IDs with real IDs from your own database):

```json
{
  "input": {
    "organizationId": "ORG_ID",
    "projectId": "PROJECT_ID",
    "title": "Implement task creation",
    "description": "Add the initial task mutation",
    "priority": "HIGH",
    "assigneeId": "USER_ID",
    "dueDate": "2026-11-01T12:00:00.000Z"
  }
}
```

### Illustrative query: fetch one task

```graphql
query GetTask($organizationId: String!, $taskId: String!) {
  task(organizationId: $organizationId, taskId: $taskId) {
    id
    title
    status
    priority
    projectId
    assigneeId
  }
}
```

### Illustrative query: project tasks

```graphql
query GetProjectTasks($organizationId: String!, $projectId: String!) {
  projectTasks(organizationId: $organizationId, projectId: $projectId) {
    id
    title
    status
    priority
    assigneeId
    dueDate
  }
}
```

> These are conceptual examples. Confirm exact argument and field names against `src/tasks/tasks.resolver.ts` and the generated GraphQL schema before using them in a client.

## 4. Create Task — service flow

```text
createTask(input)
      │
      ▼
JWT guard authenticates caller
      │
      ▼
Check caller membership in input.organizationId
      ├── No membership → reject (403)
      ▼
Find project scoped to that organization
      ├── Not found in org → reject (404)
      ▼
If caller is EMPLOYEE, check project membership
      ├── Not a member → reject
      ▼
If assigneeId supplied, check assignee's project membership
      ├── Not a member → reject
      ▼
Validate/normalize title and dueDate
      ▼
Create task with caller as createdById
      ▼
Return created task
```

### Creation rules implemented in the service

- Caller must belong to the specified organization.
- Project must belong to that organization.
- `ADMIN` and `MANAGER` can create tasks in organization projects.
- `EMPLOYEE` can create tasks only in a project they belong to.
- A supplied assignee must be a member of that project.
- Title is trimmed; an empty title is rejected.
- A supplied due date must be valid.
- Priority defaults to `MEDIUM` when omitted.
- Status defaults to `TODO` through the Prisma model default.
- `createdById` is derived from the authenticated caller.

### Why validate both in the service and database?

1. Service checks enforce application permissions and return intentional errors.
2. Database constraints stop invalid relationships from being persisted even if a code path misses a check.

Use both layers.

## 5. Fetch one task

The query must not fetch by task ID alone and return the result to any authenticated user.

Flow:
1. Verify the caller belongs to the requested organization.
2. Find the task scoped to that organization.
3. If the caller is an `EMPLOYEE`, verify membership in the task's project.
4. Return the task only if all checks pass.

Access policy:
- `ADMIN` / `MANAGER`: may view organization tasks.
- `EMPLOYEE`: may view tasks only in projects they belong to.
- A task from another organization must not be accessible by changing IDs.

**Why scope by organization?** An ID is a locator, not a permission. Queries should include the organization boundary so a user cannot use a task ID from another tenant to cross that boundary.

## 6. List project tasks

The project task query returns tasks for a particular project.

Checks:
1. Verify organization membership.
2. Verify the project exists inside the requested organization.
3. For an `EMPLOYEE`, verify project membership.
4. Return tasks scoped to that project.

Expected access:
- `ADMIN` / `MANAGER`: can list tasks for projects in their organization.
- `EMPLOYEE`: can list tasks only for projects they belong to.
- A project from another organization must not be accessible by altering request IDs.

Pagination, filtering, sorting, and search should be treated as separate enhancements unless already explicitly implemented.

## 7. Error handling

The service uses NestJS exceptions for expected failures. The GraphQL formatting layer shapes the errors exposed to clients.

| Situation | Typical error category |
|---|---|
| Caller is not an organization member | Forbidden / 403 |
| Project or task not found in requested organization | Not found / 404 |
| Empty title or invalid date | Bad request / 400 |
| Applicable uniqueness conflict | Conflict / 409 |

Never expose SQL, stack traces, secrets, raw database errors, or environment values to GraphQL clients. Use server logs and tests to investigate internal failures.

## 8. Testing strategy

`src/tasks/tasks.service.spec.ts` currently contains **49 tests**. The full project test run recorded **361 passing tests across 20 files**.

### Create tests should cover
- Organization membership is required.
- Project must exist in the specified organization.
- Employee must belong to the project.
- Assignee must belong to the project.
- Creator is taken from the authenticated caller.
- Title whitespace is trimmed and blank title rejected.
- Invalid due date is rejected.
- Optional fields work as intended.
- Default priority is applied when omitted.

### Single-task query tests should cover
- Organization membership is required.
- Lookup is scoped to the organization.
- Employee must belong to the task's project.
- Cross-organization access is rejected.

### Project-list tests should cover
- Organization membership is required.
- Project exists within the organization.
- Employee must belong to the project.
- Results are restricted to that project.
- Cross-organization access is rejected.

### Testing mindset

For each protected operation, test:
1. Valid caller + valid resource.
2. Caller with no organization membership.
3. Organization member without required project membership.
4. Resource from another organization.
5. Invalid input.
6. Role-specific boundaries.

Mock Prisma calls in service unit tests and check important query arguments as well as return values. A test that merely confirms “a task was returned” may miss a tenant-isolation bug.

## 9. Verification commands

Run these from the backend directory:

```bash
pnpm test
pnpm build
pnpm lint
pnpm exec prisma validate
pnpm exec prisma migrate status
git diff --check
```

Before committing staged files:

```bash
git diff --cached --check
git diff --cached --stat
git status
```

### Results recorded during this session

- `pnpm test`: **20 test files passed; 361 tests passed**.
- `pnpm build`: successful.
- `pnpm lint`: **0 warnings and 0 errors**.
- `pnpm exec prisma migrate status`: **7 migrations found; database schema is up to date**.
- `git diff --check`: no output, indicating no whitespace errors in the checked diff.

Vitest prints a tooling notice that Vite supports TypeScript path resolution natively and `vite-tsconfig-paths` may be removable. This notice did not fail the tests; handle it separately rather than mixing it into Task module work.

## 10. Git checkpoint

Review staged changes:

```bash
git status
git diff --cached --check
git diff --cached --stat
```

Never stage `.env`, credentials, private keys, or unrelated local files.

Commit:

```bash
git commit -m "feat(tasks): implement task management and access control"
```

Push:

```bash
git push origin main
```

A push does not commit staged files. If `git push` says `Everything up-to-date` while Git still says “Changes to be committed,” create the commit first and then push.

## 11. Day 2 completion checklist

- [x] Task GraphQL module and resolver exist.
- [x] Create Task input and validation exist.
- [x] Single-task query exists.
- [x] Project tasks query exists.
- [x] Organization membership checks are applied.
- [x] Employee project-membership restrictions are applied.
- [x] Assignee project-membership validation is applied.
- [x] Task query access is organization-scoped.
- [x] Task service unit tests exist.
- [x] Full test suite passed during verification.
- [x] Build passed during verification.
- [x] Lint passed during verification.
- [x] Prisma schema and migration status were validated.
- [ ] Commit the staged changes.
- [ ] Push the new commit to `origin/main`.
- [ ] Save this document as `notes/week-03/day2.md`.

Do not mark the last three items complete until the commands actually succeed.

## 12. Next day

The original Week 3 roadmap places **Update Task + archive/delete policy** after Create Task and Task Queries.

Before starting:
1. Save this Day 2 note.
2. Commit and push the implementation if that has not already happened.
3. Review existing Project and Organization modules to reuse conventions.
4. Define the next operation's authorization and deletion/archive policy before changing code.
5. Add tests for authorization and edge cases alongside implementation.

Keep the scope focused. Do not jump to comments, activity feeds, notifications, or later features until the planned task-management work is complete.
