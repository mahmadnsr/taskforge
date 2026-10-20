import { HttpException, Logger } from '@nestjs/common';
import type { GraphQLFormattedError } from 'graphql';
import {
  VALIDATION_FALLBACK,
  describeValidationFailures,
  recordedValidationFailures,
} from './safe-validation.js';

const logger = new Logger('GraphQLError');

/**
 * Messages the application throws ON PURPOSE for clients, taken from the
 * actual `throw new ...Exception(...)` calls in src/. In production an
 * HttpException message is sent to the client only if it is listed here.
 *
 * public-messages.spec.ts fails when a thrown message is missing from this set
 * (add it only after deciding that it is safe to show) or when an entry here is
 * no longer thrown anywhere (remove it).
 *
 * Known trade-offs (accepted, see notes):
 * - 'Email already registered' confirms that an account exists (account
 *   enumeration). Mitigation: register is rate limited to 5 requests/minute.
 * - 'This user is already a member' and 'An active invitation already exists
 *   for this email' are only thrown AFTER the caller was verified as an
 *   ADMIN/MANAGER of that organization (invitations.service.ts).
 * - 'You are already a member of this organization' is only thrown to the
 *   authenticated user about their own membership (invitation accept flow).
 */
export const PUBLIC_ERROR_MESSAGES: ReadonlySet<string> = new Set([
  // auth.service.ts, jwt-auth.guard.ts
  'Email already registered',
  'Invalid email or password',
  'Invalid or expired refresh token',
  'Missing access token',
  'Invalid or expired access token',
  'Unauthorized', // Nest default for `new UnauthorizedException()`
  // roles.guard.ts
  'Authentication required',
  'Missing x-organization-id header',
  // tenancy and roles (several services)
  'You are not a member of this organization',
  'Insufficient role',
  // organizations: members and invitations
  'Member not found',
  'Managers can only invite employees',
  'This user is already a member',
  'An active invitation already exists for this email',
  'You are already a member of this organization',
  'Invalid or expired invitation',
  'An organization must have at least one admin',
  'Concurrent update detected, please retry',
  // projects.service.ts
  'Project not found',
  'Name cannot be empty',
  'Nothing to update',
  'Archived projects cannot be updated',
  'Cannot modify tasks in an archived project',
  'You must be a project member to create tasks',
  'Assignee must be a member of this project',
  'Task title cannot be empty',
  'Invalid due date',
  'Task not found',
  'Only admins and managers can update task details',
  'Provide at least one field to update',
  'You must be a project member to change task status',
  'You can only change the status of tasks assigned to you',
  'You must be a project member to view this task',
  'You must be a project member to view project tasks',
  'Invalid task status transition',
  'Provide assigneeId or null to unassign the task',
  'Only admins and managers can assign tasks',
  'Limit must be an integer between 1 and 100',
  'Offset must be a non-negative integer',
  'Invalid task sort field',
  'Invalid sort direction',
  'You must be a project member to access task comments',
  'Comment content cannot be empty',
  'Cannot add comments to an archived project',
  'Comment not found',
  'Cannot modify comments in an archived project',
  'You can only modify your own comments',
  'Invalid comment cursor',
]);

/** HttpException statuses that may reach clients, with their public code. */
const STATUS_POLICY: ReadonlyMap<number, { code: string; fallback: string }> =
  new Map([
    [400, { code: 'BAD_REQUEST', fallback: 'Bad request' }],
    [401, { code: 'UNAUTHENTICATED', fallback: 'Unauthorized' }],
    [403, { code: 'FORBIDDEN', fallback: 'Forbidden' }],
    [404, { code: 'NOT_FOUND', fallback: 'Not found' }],
    [409, { code: 'CONFLICT', fallback: 'Conflict' }],
  ]);

/**
 * Errors that are not HttpExceptions: created by Apollo/graphql-js or by
 * GqlThrottlerGuard. Their original messages can echo client input or schema
 * hints ("Did you mean ..."), so production always replaces the message with a
 * fixed text for the code. Any other code is masked.
 */
const FIXED_MESSAGE_BY_CODE: ReadonlyMap<string, string> = new Map([
  ['TOO_MANY_REQUESTS', 'Too many requests, please try again later'],
  ['GRAPHQL_PARSE_FAILED', 'Invalid GraphQL query'],
  ['GRAPHQL_VALIDATION_FAILED', 'GraphQL validation failed'],
  ['BAD_USER_INPUT', 'Invalid input'],
  ['BAD_REQUEST', 'Bad request'],
  ['OPERATION_RESOLUTION_FAILURE', 'Operation could not be resolved'],
]);

const VALIDATION_MESSAGE = 'Bad Request Exception';

/**
 * Returns the exception that was thrown inside the resolver.
 * Deliberately not using `instanceof GraphQLError`: `graphql` can be loaded
 * twice (ESM and CJS) and that check then silently fails.
 */
function unwrapOriginalError(error: unknown): unknown {
  if (typeof error === 'object' && error !== null && 'originalError' in error) {
    const inner = (error as { originalError?: unknown }).originalError;
    if (inner) return inner;
  }
  return error;
}

/** Existing behaviour, kept byte-for-byte outside production. */
function legacyFormat(formatted: GraphQLFormattedError): GraphQLFormattedError {
  const extensions = { ...formatted.extensions } as Record<string, unknown>;
  delete extensions.stacktrace;
  return { ...formatted, extensions };
}

function masked(): GraphQLFormattedError {
  return {
    message: 'Internal server error',
    extensions: { code: 'INTERNAL_SERVER_ERROR' },
  };
}

/**
 * Production log line for a suppressed message: HTTP status, category and a
 * count only. Never the exception message or response body (they can contain
 * submitted values), never the path (it can contain client-chosen aliases).
 * No request/correlation ID exists in this codebase yet; add it here once a
 * request-context mechanism is introduced.
 */
function logSuppressed(status: number, category: string, count: number): void {
  logger.warn(
    `Suppressed GraphQL error detail (status=${status}, category=${category}, count=${count})`,
  );
}

function responseMessage(exception: HttpException): unknown {
  const response = exception.getResponse();
  return typeof response === 'string'
    ? response
    : (response as { message?: unknown } | null)?.message;
}

function fromHttpException(
  formatted: GraphQLFormattedError,
  exception: HttpException,
): GraphQLFormattedError | null {
  const status = exception.getStatus();
  const policy = STATUS_POLICY.get(status);
  if (!policy) return null; // any other status (418, 413, 422, 5xx, ...) is masked

  const raw = responseMessage(exception);
  const base = { path: formatted.path, locations: formatted.locations };

  if (status === 400) {
    // Validation failures. Message text is never trusted (it can be custom or
    // contain submitted values): feedback is generated from the structured
    // failures recorded by SafeValidationPipe, for approved fields and
    // constraints only (see safe-validation.ts).
    const failures = recordedValidationFailures(exception);
    if (failures) {
      const { messages, unverified } = describeValidationFailures(failures);
      if (unverified > 0) {
        logSuppressed(status, 'unverified_validation_failure', unverified);
      }
      return {
        message: VALIDATION_MESSAGE,
        ...base,
        extensions: { code: policy.code, validationErrors: messages },
      };
    }
    // A message list that did not come from SafeValidationPipe (a plain
    // ValidationPipe, or code throwing BadRequestException([...])): its text
    // cannot be verified, so only the fixed fallback is returned.
    if (Array.isArray(raw) && raw.length > 0) {
      logSuppressed(status, 'untrusted_validation_source', raw.length);
      return {
        message: VALIDATION_MESSAGE,
        ...base,
        extensions: {
          code: policy.code,
          validationErrors: [VALIDATION_FALLBACK],
        },
      };
    }
  }

  if (typeof raw === 'string' && PUBLIC_ERROR_MESSAGES.has(raw)) {
    return { message: raw, ...base, extensions: { code: policy.code } };
  }

  // Expected status, but the message was not intended for clients.
  logSuppressed(status, 'non_public_message', 1);
  return {
    message: policy.fallback,
    ...base,
    extensions: { code: policy.code },
  };
}

function fromKnownCode(
  formatted: GraphQLFormattedError,
): GraphQLFormattedError | null {
  const code = formatted.extensions?.code;
  if (typeof code !== 'string') return null;
  const fixed = FIXED_MESSAGE_BY_CODE.get(code);
  if (!fixed) return null;
  return {
    message: fixed,
    path: formatted.path,
    locations: formatted.locations,
    extensions: { code },
  };
}

/**
 * Apollo `formatError` implementation.
 *
 * Production output is built from scratch and only ever contains
 * `message`, `path`, `locations` and `extensions.code` (plus
 * `extensions.validationErrors` for validation failures). `originalError`,
 * `status`, stack traces and raw exception messages are never copied.
 * Outside production the previous behaviour is unchanged.
 */
export function formatGraphQLError(
  formatted: GraphQLFormattedError,
  error: unknown,
  isProduction: boolean,
): GraphQLFormattedError {
  if (!isProduction) return legacyFormat(formatted);

  const original = unwrapOriginalError(error);
  if (original instanceof HttpException) {
    return fromHttpException(formatted, original) ?? masked();
  }

  return fromKnownCode(formatted) ?? masked();
}
