# 📘 Week 4 — Day 2: Task Comment Author Details

## 🎯 Goal

Task Comments feature ko extend karna taaki har comment ke response mein author ki information bhi return ho. Privacy ke liye author ka email expose nahi kiya jayega.

## 🛠️ Implementation

### 1. CommentAuthor GraphQL Entity

File: `src/task-comments/entities/comment-author.entity.ts`

Created a separate GraphQL entity containing:
- `id`
- `name`
- `createdAt`

Email field intentionally excluded to prevent unnecessary exposure of personal information.

### 2. TaskComment Entity Updated

File: `src/task-comments/entities/task-comment.entity.ts`

Added the `author` field using the `CommentAuthor` entity so that each comment can return its author's details.

### 3. TaskCommentsService Updated

File: `src/task-comments/task-comments.service.ts`

- Updated `create()` to include author information in the comment response.
- Updated `findByTask()` to fetch author details along with comments.
- Selected only the required user fields: `id`, `name`, and `createdAt`.
- Mapped the nested Prisma author relation into the expected response structure.
- Preserved existing authorization, tenant isolation, project membership checks, and comment ordering.

### 4. Service Tests Updated

File: `src/task-comments/task-comments.service.spec.ts`

Updated mocks and expected Prisma query arguments to support the nested author relation.

### 5. Resolver Tests Added

File: `src/task-comments/task-comments.resolver.spec.ts`

Added two unit tests:
- Verify that `createTaskComment` forwards the authenticated user ID and input to the service.
- Verify that `taskComments` forwards the authenticated user ID, organization ID, and task ID to the service.

## 🧪 Verification

### Targeted Tests
```bash
pnpm exec vitest run src/task-comments/task-comments.service.spec.ts src/task-comments/task-comments.resolver.spec.ts