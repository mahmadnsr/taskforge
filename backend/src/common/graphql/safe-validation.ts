import { HttpException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from '@nestjs/common';

/**
 * Trusted validation metadata for production error responses.
 *
 * The text of a validation message is never trusted: a DTO (or any code that
 * throws BadRequestException) can put anything into it, including the submitted
 * value. Instead SafeValidationPipe records, for every failed property, only
 *   - the property path (which field failed), and
 *   - the constraint NAME (which rule failed, e.g. "isEmail"),
 * both taken from class-validator's structured ValidationError, never from a
 * message. Production responses are then generated from the two allowlists
 * below. Whatever is not on them becomes a fixed fallback entry.
 */

/**
 * DTO property names that may be named in a response. Taken from the actual
 * DTOs in src/ (public-messages.spec.ts fails when a DTO field is missing here
 * or an entry here no longer exists in any DTO). Needed because a property name
 * is only code-defined when whitelisting strips unknown keys; with
 * `forbidNonWhitelisted` (or a Map-like property) it can be a client-chosen key.
 */
export const APPROVED_FIELDS: ReadonlySet<string> = new Set([
  'assigneeId',
  'description',
  'dueDate',
  'email',
  'limit',
  'offset',
  'search',
  'sortBy',
  'sortDirection',
  'name',
  'organizationId',
  'organizationName',
  'password',
  'priority',
  'projectId',
  'refreshToken',
  'role',
  'status',
  'taskId',
  'title',
  'token',
  'userId',
]);

/**
 * class-validator constraint names that may be reported, with the text this
 * server generates for them. The texts are constants: they contain no
 * submitted value and no constraint arguments (limits, enum members), which
 * would have to be read from a message.
 */
export const CONSTRAINT_MESSAGES: ReadonlyMap<string, string> = new Map([
  ['isNotEmpty', 'should not be empty'],
  ['isString', 'must be a string'],
  ['isEmail', 'must be an email'],
  ['isDate', 'must be a valid date'],
  ['isUuid', 'must be a UUID'],
  ['maxLength', 'is too long'],
  ['minLength', 'is too short'],
  ['isEnum', 'must be one of the allowed values'],
  ['isInt', 'must be an integer'],
  ['min', 'is below the minimum allowed value'],
  ['max', 'exceeds the maximum allowed value'],
]);

export const VALIDATION_FALLBACK = 'One or more fields are invalid';

const MAX_DEPTH = 5;
const MAX_FAILURES = 200;
const MAX_MESSAGES = 20;

export type ValidationFailure = {
  readonly path: readonly string[];
  readonly constraint: string;
};

/**
 * Exceptions created by SafeValidationPipe and the failures it recorded. A
 * WeakMap cannot be forged by anything that only controls an exception's
 * message or body, and only code in this module can add entries.
 */
const recorded = new WeakMap<object, readonly ValidationFailure[]>();

function collect(
  errors: readonly ValidationError[],
  prefix: readonly string[],
  out: ValidationFailure[],
): void {
  for (const error of errors) {
    if (out.length >= MAX_FAILURES) return;
    const path = [...prefix, String(error.property)];
    for (const constraint of Object.keys(error.constraints ?? {})) {
      if (out.length >= MAX_FAILURES) return;
      out.push({ path, constraint });
    }
    if (error.children?.length) {
      if (path.length >= MAX_DEPTH) {
        // too deep to describe: record only if the failure cap has room
        if (out.length < MAX_FAILURES) {
          out.push({ path, constraint: 'maxDepthExceeded' });
        }
      } else {
        collect(error.children, path, out);
      }
    }
  }
}

/**
 * Drop-in replacement for `new ValidationPipe(options)`. The exceptions it
 * throws are identical to Nest's default ones (same status, same body, so
 * development output is unchanged); it additionally records the structured
 * failures for the production formatter. A plain ValidationPipe still works,
 * but then production responses carry only the fixed fallback.
 */
export class SafeValidationPipe extends ValidationPipe {
  override createExceptionFactory() {
    const base = super.createExceptionFactory();
    return (validationErrors: ValidationError[] = []) => {
      const exception = base(validationErrors);
      if (
        exception instanceof HttpException &&
        !this.isDetailedOutputDisabled
      ) {
        const failures: ValidationFailure[] = [];
        collect(validationErrors, [], failures);
        recorded.set(exception, failures);
      }
      return exception;
    };
  }
}

/** The failures recorded by SafeValidationPipe, or undefined for any other exception. */
export function recordedValidationFailures(
  exception: object,
): readonly ValidationFailure[] | undefined {
  return recorded.get(exception);
}

function isApprovedPath(path: readonly string[]): boolean {
  return path.length === 1 && APPROVED_FIELDS.has(path[0]);
}
/**
 * Client-facing messages for the recorded failures: generated only for an
 * approved field AND an approved constraint, one fixed fallback entry for
 * everything else. Message text from the exception is never read.
 */
export function describeValidationFailures(
  failures: readonly ValidationFailure[],
): { messages: string[]; unverified: number } {
  const verified = new Set<string>();
  let unverified = 0;
  for (const { path, constraint } of failures) {
    const text = CONSTRAINT_MESSAGES.get(constraint);
    if (text !== undefined && isApprovedPath(path)) {
      verified.add(`${path.join('.')} ${text}`);
    } else {
      unverified += 1;
    }
  }
  if (failures.length === 0) unverified = 1;
  // a slot is reserved so the fallback always fits within the cap
  const room = unverified > 0 ? MAX_MESSAGES - 1 : MAX_MESSAGES;
  const messages = [...verified].slice(0, room);
  if (unverified > 0) messages.push(VALIDATION_FALLBACK);
  return { messages, unverified };
}
