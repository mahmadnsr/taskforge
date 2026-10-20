# Week 4 — Day 4: Task Comment Cursor Pagination

## Goal

Add cursor-based pagination to task comments while preserving existing
organization authorization, employee project-membership checks, and
chronological ordering.

## Implementation

- Added `TaskCommentsPaginationInput` with:
  - `organizationId`
  - `taskId`
  - `first` (default: 10, minimum: 1, maximum: 100)
  - `after` (optional cursor)
- Added `TaskCommentsPage` GraphQL response:
  - `items`
  - `nextCursor`
  - `hasMore`
- Added cursor encoding and strict Base64URL decoding.
- Rejects malformed/non-canonical Base64URL, invalid JSON payloads, invalid dates, and empty or whitespace-padded IDs.
- Invalid cursors produce `Invalid comment cursor`.
- Comments are ordered by `createdAt ASC`, then `id ASC`.
- Fetches up to `first + 1` comments to determine whether another page exists.
- The next cursor is generated from the last returned comment when more
  results exist.
- Cursor pagination uses timestamp and ID comparisons, so it does not depend
  on the cursor comment still existing.
- Preserved organization membership, task scope, employee project membership,
  and public author mapping.

## GraphQL API Change

The `taskComments` query now accepts a pagination input and returns a
`TaskCommentsPage` object instead of a list of comments.

Clients should request `items`, `nextCursor`, and `hasMore` from the response.
Use the returned `nextCursor` as `after` to fetch the next page.

## Error Handling

- Added `Invalid comment cursor` to the public error-message allowlist.
- Mapped the error to HTTP status 400 in the GraphQL error tests.
- Added `after` to the approved validation fields.

## Tests and Validation

- Full Vitest suite: 462 tests passed across 23 files, including strict cursor validation tests.
- TypeScript check: `pnpm exec tsc --noEmit` passed.
- Production build: `pnpm build` passed.
- Whitespace validation: `git diff --check` passed.

## Commit Status

Not committed or pushed yet.
