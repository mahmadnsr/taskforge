# Week 4 — Day 3: Update and Delete Task Comments

## Goal

Implement secure comment editing and deletion with organization/task scoping,
role-based authorization, archived-project restrictions, and public GraphQL errors.

## Implementation

- Added `UpdateTaskCommentInput` with UUID validation and a 5000-character maximum.
- Added `updateTaskComment` and `deleteTaskComment` GraphQL mutations.
- Update trims content and rejects whitespace-only comments.
- Update returns the comment author using only public fields: ID, name, and creation date.
- Delete returns a Boolean result.
- Both mutations scope database operations by comment ID, organization ID, and task ID.
- Added resolver tests for update and delete delegation.

## Authorization Policy

- Every user can edit only their own comments, including ADMIN and MANAGER.
- ADMIN and MANAGER can delete comments belonging to their organization.
- EMPLOYEE can edit or delete only their own comments and must belong to the task's project.
- Editing and deletion are blocked when the project is archived.
- Missing or out-of-scope comments return `Comment not found`.
- Blank comment content is rejected.
- Email is not exposed in the GraphQL comment-author object.

## Error Handling

Added approved public messages for:
- `Comment not found`
- `Cannot modify comments in an archived project`
- `You can only modify your own comments`

Added `commentId` to approved validation fields.

## Validation

- Targeted comment service and resolver tests: 35/35 passed.
- Full test suite: 443/443 tests passed across 22 files.
- TypeScript check: `pnpm exec tsc --noEmit`
- Build: `pnpm build`
- Whitespace validation: `git diff --check`

## Commands Used

```bash
pnpm exec vitest run \
  src/task-comments/task-comments.service.spec.ts \
  src/task-comments/task-comments.resolver.spec.ts

pnpm exec vitest run
pnpm exec tsc --noEmit
pnpm build
git diff --check

```
