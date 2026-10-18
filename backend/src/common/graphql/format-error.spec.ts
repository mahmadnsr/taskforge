import { afterEach, describe, it, expect, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import type { ValidationError } from '@nestjs/common';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateBy,
} from 'class-validator';
import { GraphQLError } from 'graphql';
import type { GraphQLFormattedError } from 'graphql';
import { PUBLIC_ERROR_MESSAGES, formatGraphQLError } from './format-error.js';
import {
  APPROVED_FIELDS,
  CONSTRAINT_MESSAGES,
  SafeValidationPipe,
  recordedValidationFailures,
} from './safe-validation.js';
import { RegisterInput } from '../../auth/dto/register.input.js';
import { LoginInput } from '../../auth/dto/login.input.js';
import { CreateProjectInput } from '../../projects/dto/create-project.input.js';
import { UpdateProjectInput } from '../../projects/dto/update-project.input.js';

/** Status that each public message is thrown with in src/ (kept in sync by the tests below). */
/**
 * Status that each public message is thrown with in src/
 * (kept in sync by the tests below).
 */
const STATUS_OF_PUBLIC_MESSAGE: Record<string, number> = {
  'Email already registered': 409,
  'Invalid email or password': 401,
  'Invalid or expired refresh token': 401,
  'Missing access token': 401,
  'Invalid or expired access token': 401,
  Unauthorized: 401,
  'Authentication required': 403,
  'Missing x-organization-id header': 403,
  'You are not a member of this organization': 403,
  'Insufficient role': 403,
  'Member not found': 404,
  'Managers can only invite employees': 403,
  'This user is already a member': 409,
  'An active invitation already exists for this email': 409,
  'You are already a member of this organization': 409,
  'Invalid or expired invitation': 400,
  'An organization must have at least one admin': 400,
  'Concurrent update detected, please retry': 409,
  'Project not found': 404,
  'Name cannot be empty': 400,
  'Nothing to update': 400,
  'Archived projects cannot be updated': 400,
  'Cannot modify tasks in an archived project': 400,
  'You must be a project member to create tasks': 403,
  'Assignee must be a member of this project': 400,
  'Task title cannot be empty': 400,
  'Invalid due date': 400,
  'Task not found': 404,
  'Only admins and managers can update task details': 403,

  // Day 4 — Task assignment
  'Only admins and managers can assign tasks': 403,
  'Provide assigneeId or null to unassign the task': 400,

  'Provide at least one field to update': 400,
  'You must be a project member to change task status': 403,
  'You can only change the status of tasks assigned to you': 403,
  'You must be a project member to view this task': 403,
  'You must be a project member to view project tasks': 403,
  'Invalid task status transition': 400,
};

const CODE_OF_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
};

const FACTORY: Record<number, (message: string) => HttpException> = {
  400: (m) => new BadRequestException(m),
  401: (m) => new UnauthorizedException(m),
  403: (m) => new ForbiddenException(m),
  404: (m) => new NotFoundException(m),
  409: (m) => new ConflictException(m),
};

/**
 * Builds the (formattedError, error) pair the same way @nestjs/apollo hands it
 * to formatError. Shapes were captured from the real server (see the
 * integration spec): HttpException travels as `error.originalError`, and the
 * formatted error carries `originalError` and `stacktrace` in `extensions`.
 */
function nestShaped(exception: HttpException) {
  const status = exception.getStatus();
  const nestCode = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHENTICATED',
    403: 'FORBIDDEN',
  }[status as 400 | 401 | 403];
  const documented = nestCode !== undefined || status === 404 || status === 409;
  const error = new GraphQLError(exception.message, {
    originalError: exception,
    path: ['field'],
  });
  const formatted: GraphQLFormattedError = {
    message: exception.message,
    path: ['field'],
    locations: [{ line: 1, column: 3 }],
    extensions: {
      code: nestCode ?? 'INTERNAL_SERVER_ERROR',
      ...(documented && !nestCode ? { status } : {}),
      ...(documented ? { originalError: exception.getResponse() } : {}),
      stacktrace: ['at secret (/srv/app/src/x.ts:1:1)'],
    },
  };
  return { formatted, error };
}

const FALLBACK = 'One or more fields are invalid';

const prod = (e: HttpException) => {
  const { formatted, error } = nestShaped(e);
  return formatGraphQLError(formatted, error, true);
};

const LEAK_FRAGMENTS = [
  'originalError',
  'stacktrace',
  'statusCode',
  '/srv/app',
  'db.internal',
  'prisma',
  'ECONNREFUSED',
  'SECRET',
];

function expectNoLeaks(out: GraphQLFormattedError) {
  const json = JSON.stringify(out);
  for (const fragment of LEAK_FRAGMENTS) expect(json).not.toContain(fragment);
  expect(
    Object.keys(out).filter(
      (k) => !['message', 'path', 'locations', 'extensions'].includes(k),
    ),
  ).toEqual([]);
  expect(
    Object.keys(out.extensions ?? {}).filter(
      (k) => !['code', 'validationErrors'].includes(k),
    ),
  ).toEqual([]);
}

function fromError(
  message: string,
  code: string,
  original: unknown,
  extra: Record<string, unknown> = {},
) {
  const error = new GraphQLError(message, {
    originalError: original as Error,
    path: ['field'],
  });
  const formatted: GraphQLFormattedError = {
    message,
    path: ['field'],
    locations: [{ line: 1, column: 3 }],
    extensions: {
      code,
      stacktrace: ['at secret (/srv/app/src/x.ts:1:1)'],
      ...extra,
    },
  };
  return { formatted, error };
}

describe('PUBLIC_ERROR_MESSAGES (production)', () => {
  it('the status table in this spec covers exactly the allowlist', () => {
    expect(new Set(Object.keys(STATUS_OF_PUBLIC_MESSAGE))).toEqual(
      PUBLIC_ERROR_MESSAGES,
    );
  });

  for (const [message, status] of Object.entries(STATUS_OF_PUBLIC_MESSAGE)) {
    it(`${status} "${message}" is delivered with its public code and nothing else`, () => {
      const out = prod(FACTORY[status](message));
      expect(out.message).toBe(message);
      expect(out.extensions).toEqual({ code: CODE_OF_STATUS[status] });
      expect(out.path).toEqual(['field']);
      expectNoLeaks(out);
    });
  }

  it('Nest default message for `new UnauthorizedException()` is public', () => {
    const out = prod(new UnauthorizedException());
    expect(out.message).toBe('Unauthorized');
    expect(out.extensions).toEqual({ code: 'UNAUTHENTICATED' });
  });
});

describe('HttpException handling (production)', () => {
  it.each([400, 401, 403, 404, 409])(
    'status %i with a message that is NOT public gets a generic text',
    (status) => {
      const out = prod(
        FACTORY[status](
          'User row 42 missing in table users (db.internal) SECRET',
        ),
      );
      expect(out.message).not.toContain('db.internal');
      expect(out.extensions).toEqual({ code: CODE_OF_STATUS[status] });
      expectNoLeaks(out);
    },
  );

  it.each([402, 410, 413, 418, 422, 500, 503])(
    'status %i is masked even with a public message',
    (status) => {
      const out = prod(new HttpException('Project not found', status));
      expect(out).toEqual({
        message: 'Internal server error',
        extensions: { code: 'INTERNAL_SERVER_ERROR' },
      });
    },
  );

  it('InternalServerErrorException is masked', () => {
    expect(
      prod(new InternalServerErrorException('db.internal down')).message,
    ).toBe('Internal server error');
  });

  it('a message list that did not come from SafeValidationPipe returns only the fallback', () => {
    // exact look-alikes of legitimate default messages, one carrying a secret
    const out = prod(
      new BadRequestException([
        'email must be an email',
        'SECRET-token must be a string',
        'name should not be empty',
      ]),
    );
    expect(out.message).toBe('Bad Request Exception');
    expect(out.extensions).toEqual({
      code: 'BAD_REQUEST',
      validationErrors: [FALLBACK],
    });
    expectNoLeaks(out);
  });

  it('non-string items in a 400 list are never echoed', () => {
    const out = prod(new BadRequestException([1, { a: 'SECRET' }] as never));
    expect(out.extensions).toEqual({
      code: 'BAD_REQUEST',
      validationErrors: [FALLBACK],
    });
  });

  it('an empty 400 array falls back to the generic text', () => {
    const out = prod(new BadRequestException([]));
    expect(out.message).toBe('Bad request');
    expect(out.extensions).toEqual({ code: 'BAD_REQUEST' });
  });
});

describe('errors that must be masked (production)', () => {
  const MASKED = {
    message: 'Internal server error',
    extensions: { code: 'INTERNAL_SERVER_ERROR' },
  };

  it('plain Error with DB details', () => {
    const e = new Error('connect ECONNREFUSED db.internal:5432');
    const { formatted, error } = fromError(
      e.message,
      'INTERNAL_SERVER_ERROR',
      e,
    );
    expect(formatGraphQLError(formatted, error, true)).toEqual(MASKED);
  });

  it('Prisma-like error', () => {
    const e = Object.assign(
      new Error('Invalid `prisma.user.create()` invocation at db.internal'),
      {
        code: 'P2002',
        meta: { target: ['email'] },
      },
    );
    const { formatted, error } = fromError(
      e.message,
      'INTERNAL_SERVER_ERROR',
      e,
    );
    expect(formatGraphQLError(formatted, error, true)).toEqual(MASKED);
  });

  it('a fake statusCode on a plain Error is not trusted', () => {
    const e = Object.assign(new Error('Project not found'), {
      statusCode: 404,
      status: 404,
    });
    const { formatted, error } = fromError(
      'Project not found',
      'INTERNAL_SERVER_ERROR',
      e,
      {
        originalError: { statusCode: 404, message: 'Project not found' },
        status: 404,
      },
    );
    expect(formatGraphQLError(formatted, error, true)).toEqual(MASKED);
  });

  it('a duck-typed object that looks like an HttpException is not trusted', () => {
    const fake = {
      getStatus: () => 404,
      getResponse: () => ({ message: 'Project not found' }),
      statusCode: 404,
    };
    const { formatted, error } = fromError(
      'Project not found',
      'INTERNAL_SERVER_ERROR',
      fake,
    );
    expect(formatGraphQLError(formatted, error, true)).toEqual(MASKED);
  });

  it('an unknown error code is masked', () => {
    const { formatted, error } = fromError(
      'anything',
      'SOMETHING_ELSE',
      new GraphQLError('anything'),
    );
    expect(formatGraphQLError(formatted, error, true)).toEqual(MASKED);
  });

  it('a prototype-key code such as "constructor" is masked', () => {
    const { formatted, error } = fromError(
      'x',
      'constructor',
      new GraphQLError('x'),
    );
    expect(formatGraphQLError(formatted, error, true)).toEqual(MASKED);
  });

  it('a non-string code is masked', () => {
    const { formatted, error } = fromError(
      'x',
      42 as unknown as string,
      new GraphQLError('x'),
    );
    expect(formatGraphQLError(formatted, error, true)).toEqual(MASKED);
  });
});

describe('Apollo built-in and throttler errors (production)', () => {
  const CASES: Array<[string, string]> = [
    ['GRAPHQL_PARSE_FAILED', 'Invalid GraphQL query'],
    ['GRAPHQL_VALIDATION_FAILED', 'GraphQL validation failed'],
    ['BAD_USER_INPUT', 'Invalid input'],
    ['BAD_REQUEST', 'Bad request'],
    ['OPERATION_RESOLUTION_FAILURE', 'Operation could not be resolved'],
    ['TOO_MANY_REQUESTS', 'Too many requests, please try again later'],
  ];

  it.each(CASES)('%s gets a fixed message and only its code', (code, fixed) => {
    const echoed =
      'Cannot query field "passwordHash" on type "User". Did you mean "SECRET"? got invalid value "SECRET"';
    const { formatted, error } = fromError(
      echoed,
      code,
      new GraphQLError(echoed),
    );
    const out = formatGraphQLError(formatted, error, true);
    expect(out.message).toBe(fixed);
    expect(out.extensions).toEqual({ code });
    expectNoLeaks(out);
  });

  it('a TOO_MANY_REQUESTS error with a different message cannot smuggle text', () => {
    const { formatted, error } = fromError(
      'rate limit key=SECRET db.internal',
      'TOO_MANY_REQUESTS',
      new GraphQLError('x'),
    );
    expect(formatGraphQLError(formatted, error, true).message).toBe(
      'Too many requests, please try again later',
    );
  });
});

describe('validation errors with sensitive submitted values (real DTOs + SafeValidationPipe)', () => {
  const pipe = new SafeValidationPipe({ whitelist: true });

  async function validate(
    metatype: new () => object,
    value: Record<string, unknown>,
  ) {
    try {
      await pipe.transform(value, { type: 'body', metatype });
      throw new Error('expected the ValidationPipe to reject the input');
    } catch (e) {
      if (!(e instanceof HttpException)) throw e;
      return prod(e);
    }
  }

  it('RegisterInput', async () => {
    const out = await validate(RegisterInput, {
      name: '',
      email: 'SECRET-not-an-email',
      password: 'SECRET',
      organizationName: 'SECRET_' + 'x'.repeat(200),
      injected: 'SECRET',
    });
    expect(out.extensions).toEqual({
      code: 'BAD_REQUEST',
      validationErrors: [
        'name should not be empty',
        'email must be an email',
        'password is too short',
        'organizationName is too long',
      ],
    });
    expectNoLeaks(out);
  });

  it('LoginInput', async () => {
    const out = await validate(LoginInput, {
      email: 'SECRET',
      password: 'SECRET_' + 'x'.repeat(200),
    });
    expectNoLeaks(out);
  });

  it('CreateProjectInput', async () => {
    const out = await validate(CreateProjectInput, {
      organizationId: 'SECRET-not-uuid',
      name: 'SECRET_' + 'x'.repeat(200),
    });
    expectNoLeaks(out);
  });

  it('UpdateProjectInput', async () => {
    const out = await validate(UpdateProjectInput, {
      organizationId: 'SECRET',
      projectId: 'SECRET',
      name: 'SECRET_' + 'x'.repeat(200),
    });
    expectNoLeaks(out);
  });
});

describe('development behaviour is unchanged', () => {
  /** The formatter that was in app.module.ts before this change (outside the production branch). */
  function previous(formattedError: GraphQLFormattedError) {
    const extensions = { ...formattedError.extensions } as Record<
      string,
      unknown
    >;
    delete extensions.stacktrace;
    return { ...formattedError, extensions };
  }

  const exceptions: HttpException[] = [
    new BadRequestException('Name cannot be empty'),
    new BadRequestException(['email must be an email']),
    new UnauthorizedException(),
    new ForbiddenException('Insufficient role'),
    new NotFoundException('Project not found'),
    new ConflictException('Email already registered'),
    new NotFoundException('User row 42 missing in table users (db.internal)'),
    new HttpException('x', 418),
  ];

  it.each(
    exceptions.map((e) => [e.constructor.name + ' ' + e.message, e] as const),
  )('identical output for %s', (_name, exception) => {
    const { formatted, error } = nestShaped(exception);
    expect(formatGraphQLError(formatted, error, false)).toEqual(
      previous(formatted),
    );
  });

  it('404/409 keep INTERNAL_SERVER_ERROR, status and originalError in development', () => {
    const { formatted, error } = nestShaped(
      new NotFoundException('Project not found'),
    );
    const out = formatGraphQLError(formatted, error, false);
    expect(out.message).toBe('Project not found');
    expect(out.extensions).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      status: 404,
    });
    expect(out.extensions).toHaveProperty('originalError');
    expect(out.extensions).not.toHaveProperty('stacktrace');
  });

  it('unexpected errors keep their real message in development', () => {
    const e = new Error('connect ECONNREFUSED db.internal:5432');
    const { formatted, error } = fromError(
      e.message,
      'INTERNAL_SERVER_ERROR',
      e,
    );
    expect(formatGraphQLError(formatted, error, false).message).toBe(e.message);
  });
});

/** Builds a class-validator ValidationError the way the validator reports it. */
function verr(
  property: string,
  constraints?: Record<string, string>,
  children?: ValidationError[],
): ValidationError {
  return {
    property,
    constraints,
    children,
    value: 'SECRET-submitted-value',
    target: { password: 'SECRET-password' },
    contexts: { x: { secret: 'SECRET-context' } },
  } as unknown as ValidationError;
}

const safeFactory = new SafeValidationPipe({
  whitelist: true,
}).createExceptionFactory();
/** An exception exactly as SafeValidationPipe throws it for these errors. */
const failWith = (...errors: ValidationError[]) =>
  safeFactory(errors) as HttpException;

const validationErrorsOf = (exception: HttpException) =>
  (prod(exception).extensions as { validationErrors: string[] })
    .validationErrors;

describe('trusted validation metadata (production)', () => {
  it('generates the message from approved field + approved constraint, ignoring the message text', () => {
    const out = prod(
      failWith(
        verr('name', { isNotEmpty: 'name should not be empty' }),
        verr('email', { isEmail: 'email must be an email' }),
        verr('organizationId', { isUuid: 'organizationId must be a UUID' }),
        verr('password', {
          minLength: 'password must be longer than or equal to 8 characters',
          maxLength: 'password must be shorter than or equal to 72 characters',
        }),
        verr('role', { isEnum: 'role must be one of the following: ADMIN' }),
        verr('description', { isString: 'description must be a string' }),
      ),
    );
    expect(out.extensions).toEqual({
      code: 'BAD_REQUEST',
      validationErrors: [
        'name should not be empty',
        'email must be an email',
        'organizationId must be a UUID',
        'password is too short',
        'password is too long',
        'role must be one of the allowed values',
        'description must be a string',
      ],
    });
    expectNoLeaks(out);
  });

  it('every approved constraint has fixed text without variable parts', () => {
    for (const text of CONSTRAINT_MESSAGES.values()) {
      expect(text).toMatch(/^[a-zA-Z ]+$/);
    }
    for (const field of APPROVED_FIELDS) expect(field).toMatch(/^[a-zA-Z]+$/);
  });

  it.each([
    // look-alikes of legitimate default messages that contain sensitive data
    ['name', 'name must be a string SECRET-token-123'],
    ['name', 'name must be a string; password=SECRET'],
    ['email', 'john.doe@example.com must be an email'],
    ['email', 'email must be an email\nSECRET'],
    ['password', 'password must be longer than or equal to SECRET characters'],
    ['password', 'SECRET must be longer than or equal to 8 characters'],
    ['role', 'role must be one of the following values: SECRET'],
    ['token', 'token SECRET-jwt should not be empty'],
  ])(
    'a malicious custom message resembling a default one is never output (%s: %j)',
    (field, message) => {
      const constraint = /email/.test(message)
        ? 'isEmail'
        : /longer/.test(message)
          ? 'minLength'
          : /one of/.test(message)
            ? 'isEnum'
            : /empty/.test(message)
              ? 'isNotEmpty'
              : 'isString';
      const out = prod(failWith(verr(field, { [constraint]: message })));
      const list = (out.extensions as { validationErrors: string[] })
        .validationErrors;
      // exactly one generated entry for the approved field, nothing else
      expect(list).toHaveLength(1);
      expect(list[0].startsWith(`${field} `)).toBe(true);
      expect(list[0]).toBe(
        `${field} ${CONSTRAINT_MESSAGES.get(constraint) as string}`,
      );
      expectNoLeaks(out);
      expect(JSON.stringify(out)).not.toContain('john.doe');
    },
  );

  it.each([
    [
      'unknown field',
      verr('secretNote', { isString: 'secretNote must be a string' }),
    ],
    [
      'client-chosen field name',
      verr('SECRET-key', { isString: 'SECRET-key must be a string' }),
    ],
    [
      'prototype key',
      verr('constructor', { isString: 'constructor must be a string' }),
    ],
    ['__proto__ key', verr('__proto__', { isString: 'x' })],
    [
      'look-alike of an approved name',
      verr('name ', { isString: 'name  must be a string' }),
    ],
    [
      'upper-case look-alike',
      verr('Name', { isString: 'Name must be a string' }),
    ],
    [
      'unapproved nested segment',
      verr('name', undefined, [verr('SECRET', { isString: 'x' })]),
    ],
    [
      'unapproved constraint',
      verr('name', { isSecretRule: 'Value SECRET rejected' }),
    ],
    [
      'whitelist violation',
      verr('SECRET-extra', {
        whitelistValidation: 'property SECRET-extra should not exist',
      }),
    ],
    ['prototype constraint', verr('name', { constructor: 'x' })],
    [
      'too deep',
      verr('name', undefined, [
        verr('0', undefined, [
          verr('0', undefined, [
            verr('0', undefined, [
              verr('0', undefined, [verr('0', { isString: 'x' })]),
            ]),
          ]),
        ]),
      ]),
    ],
  ])('%s becomes the fixed fallback and is not echoed', (_label, error) => {
    const out = prod(failWith(error));
    expect(out.extensions).toEqual({
      code: 'BAD_REQUEST',
      validationErrors: [FALLBACK],
    });
    expectNoLeaks(out);
  });

  it('uses the fixed fallback for array indexes under an approved field', () => {
  const error = failWith(
    verr('userId', undefined, [verr('0', { isUuid: 'SECRET' })]),
  );

  expect(validationErrorsOf(error)).toEqual([FALLBACK]);
  expect(JSON.stringify(prod(error))).not.toContain('SECRET');
});

  it('uses the fixed fallback for nested paths without leaking validator messages', () => {
  const error = failWith(
    verr('userId', undefined, [
      verr('0', undefined, [
        verr('email', { isEmail: 'SECRET submitted value' }),
      ]),
    ]),
  );

  expect(validationErrorsOf(error)).toEqual([FALLBACK]);
  expect(JSON.stringify(prod(error))).not.toContain('SECRET');
});

  it('does not exceed MAX_FAILURES when the depth boundary is reached', () => {
    const manyConstraints = Object.fromEntries(
      Array.from({ length: 200 }, (_, i) => [`constraint${i}`, 'SECRET']),
    );

    const deepError = verr('name', undefined, [
      verr('0', undefined, [
        verr('0', undefined, [
          verr('0', undefined, [
            verr('0', manyConstraints, [
              verr('0', { isString: 'SECRET' }),
            ]),
          ]),
        ]),
      ]),
    ]);

    const error = failWith(deepError);
    const failures = recordedValidationFailures(error);

    expect(failures).toHaveLength(200);
    expect(validationErrorsOf(error)).toEqual([FALLBACK]);
    expect(JSON.stringify(prod(error))).not.toContain('SECRET');
  });

  it('mixed failures keep the approved ones and add one fallback at the end', () => {
    expect(
      validationErrorsOf(
        failWith(
          verr('email', { isEmail: 'x' }),
          verr('secretNote', { isString: 'x' }),
          verr('name', { isNotEmpty: 'x', isSecretRule: 'x' }),
          verr('other', { isString: 'x' }),
        ),
      ),
    ).toEqual(['email must be an email', 'name should not be empty', FALLBACK]);
  });

  it('duplicates collapse and the list never exceeds 20 entries, fallback included', () => {
    const fields = [...APPROVED_FIELDS];
    const constraints = [...CONSTRAINT_MESSAGES.keys()];
    const many = fields.map((f) =>
      verr(f, Object.fromEntries(constraints.map((c) => [c, 'x']))),
    );
    expect(validationErrorsOf(failWith(...many))).toHaveLength(20);
    const withUnsafe = validationErrorsOf(
      failWith(...many, verr('zzz', { isString: 'x' })),
    );
    expect(withUnsafe).toHaveLength(20);
    expect(withUnsafe.at(-1)).toBe(FALLBACK);
    expect(
      validationErrorsOf(
        failWith(
          verr('name', { isString: 'x' }),
          verr('name', { isString: 'y' }),
        ),
      ),
    ).toEqual(['name must be a string']);
  });

  it('a very large error set is handled quickly and stays capped', () => {
    const started = Date.now();
    const big = Array.from({ length: 5000 }, (_, i) =>
      verr(`f${i}`, { isString: 'x' }),
    );
    expect(validationErrorsOf(failWith(...big))).toEqual([FALLBACK]);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('an exception with no recorded failures at all yields only the fallback', () => {
    expect(validationErrorsOf(failWith())).toEqual([FALLBACK]);
  });

  describe('trust cannot be forged', () => {
    it('an identical body from another BadRequestException is untrusted', () => {
      const trusted = failWith(verr('name', { isString: 'x' }));
      const forged = new BadRequestException(trusted.getResponse());
      expect(validationErrorsOf(forged)).toEqual([FALLBACK]);
    });

    it('copying properties or the prototype of a trusted exception does not transfer trust', () => {
      const trusted = failWith(verr('name', { isString: 'x' }));
      const copy = Object.assign(
        new BadRequestException(['name must be a string']),
        trusted,
      );
      const child = Object.create(trusted) as HttpException;
      expect(validationErrorsOf(copy)).toEqual([FALLBACK]);
      // Object.create(trusted) is not an HttpException of its own: masked or fallback, never generated text
      expect(JSON.stringify(prod(child))).not.toContain(
        'name must be a string',
      );
    });

    it('a plain ValidationPipe (not SafeValidationPipe) only ever yields the fallback', async () => {
      class Plain {
        @IsString({ message: 'name must be a string' }) name!: string;
        @IsEmail({}, { message: 'email must be an email' }) email!: string;
      }
      const pipe = new ValidationPipe({ whitelist: true });
      const error = await pipe
        .transform(
          { name: 1, email: 'SECRET' },
          { type: 'body', metatype: Plain },
        )
        .catch((e: unknown) => e as HttpException);
      expect(validationErrorsOf(error as HttpException)).toEqual([FALLBACK]);
    });

    it('disableErrorMessages records nothing and yields the generic text', async () => {
      const pipe = new SafeValidationPipe({
        whitelist: true,
        disableErrorMessages: true,
      });
      class Dto {
        @IsString() name!: string;
      }
      const error = (await pipe
        .transform({ name: 1 }, { type: 'body', metatype: Dto })
        .catch((e: unknown) => e)) as HttpException;
      expect(prod(error).message).toBe('Bad request');
      expect(prod(error).extensions).toEqual({ code: 'BAD_REQUEST' });
    });
  });
});

describe('custom messages through the real SafeValidationPipe (production)', () => {
  enum Color {
    RED = 'RED',
    BLUE = 'BLUE',
  }
  const leak = (a: { value?: unknown }) => `${String(a.value)}`;

  /** Custom messages that look like defaults but contain the submitted value. */
  class LookAlikeInput {
    @IsString({ message: (a) => `name must be a string ${leak(a)}` })
    name!: string;
    @IsEmail({}, { message: (a) => `${leak(a)} must be an email` })
    email!: string;
    @MinLength(8, {
      message: (a) =>
        `password must be longer than or equal to 8 characters, got ${leak(a)}`,
    })
    password!: string;
  }

  class UnapprovedFieldInput {
    @IsString({ message: 'secretNote must be a string' }) secretNote!: string;
  }

  class CustomRuleInput {
    @ValidateBy({
      name: 'isSecretRule',
      validator: {
        validate: () => false,
        defaultMessage: (a) => `Value ${leak(a!)} rejected`,
      },
    })
    name!: string;
  }

  /** One decorator per approved constraint, each failing. */
  class AllRulesInput {
    @IsNotEmpty() name!: string;
    @IsString() description!: string;
    @IsEmail() email!: string;
    @IsUUID() projectId!: string;
    @MaxLength(3) organizationName!: string;
    @MinLength(8) password!: string;
    @IsEnum(Color) role!: Color;
  }

  async function run(
    metatype: new () => object,
    value: object,
    options: ConstructorParameters<typeof SafeValidationPipe>[0] = {
      whitelist: true,
    },
  ) {
    const pipe = new SafeValidationPipe(options);
    const error = await pipe.transform(value, { type: 'body', metatype }).then(
      () => {
        throw new Error('expected the ValidationPipe to reject the input');
      },
      (e: unknown) => e,
    );
    if (!(error instanceof HttpException)) throw error;
    return prod(error);
  }

  it('look-alike custom messages containing submitted values never reach the response', async () => {
    const out = await run(LookAlikeInput, {
      name: 12345,
      email: 'SECRET-email-value',
      password: 'SECRET',
    });
    expect(out.extensions).toEqual({
      code: 'BAD_REQUEST',
      validationErrors: [
        'name must be a string',
        'email must be an email',
        'password is too short',
      ],
    });
    const json = JSON.stringify(out);
    for (const secret of ['12345', 'SECRET', 'got'])
      expect(json).not.toContain(secret);
  });

  it('a field that is not approved becomes the fallback even with a perfect-looking message', async () => {
    const out = await run(UnapprovedFieldInput, { secretNote: 5 });
    expect(out.extensions).toEqual({
      code: 'BAD_REQUEST',
      validationErrors: [FALLBACK],
    });
  });

  it('a custom validator (unapproved constraint) becomes the fallback and its message is dropped', async () => {
    const out = await run(CustomRuleInput, { name: 'SECRET-name' });
    expect(out.extensions).toEqual({
      code: 'BAD_REQUEST',
      validationErrors: [FALLBACK],
    });
    expect(JSON.stringify(out)).not.toContain('SECRET');
  });

  it('forbidNonWhitelisted: a client-chosen property name is not echoed', async () => {
    const out = await run(
      AllRulesInput,
      {
        name: 'ok',
        description: 'ok',
        email: 'a@b.co',
        projectId: '123e4567-e89b-42d3-a456-426614174000',
        organizationName: 'abc',
        password: 'long-enough',
        role: 'RED',
        'SECRET-extra-key': 'SECRET-extra-value',
      },
      { whitelist: true, forbidNonWhitelisted: true },
    );
    expect(out.extensions).toEqual({
      code: 'BAD_REQUEST',
      validationErrors: [FALLBACK],
    });
    expect(JSON.stringify(out)).not.toContain('SECRET');
  });

  it('the real class-validator constraint names match the approved ones, so default feedback stays useful', async () => {
    const out = await run(AllRulesInput, {
      name: '',
      description: 5,
      email: 'x',
      projectId: 'x',
      organizationName: 'too long',
      password: 'abc',
      role: 'nope',
    });
    expect(out.extensions).toEqual({
      code: 'BAD_REQUEST',
      validationErrors: [
        'name should not be empty',
        'description must be a string',
        'email must be an email',
        'projectId must be a UUID',
        'organizationName is too long',
        'password is too short',
        'role must be one of the allowed values',
      ],
    });
  });

  it('every approved constraint is exercised by the test above (no untested constraint)', () => {
    const exercised = new Set([
      'isNotEmpty',
      'isString',
      'isEmail',
      'isUuid',
      'maxLength',
      'minLength',
      'isEnum',
      'isDate',
    ]);
    expect([...CONSTRAINT_MESSAGES.keys()].sort()).toEqual(
      [...exercised].sort(),
    );
  });
});

describe('SafeValidationPipe keeps the default exception (development output)', () => {
  const errors = [
    verr('name', { isString: 'Custom name message SECRET-dev' }),
    verr('email', { isEmail: 'email must be an email' }),
  ];

  it("throws exactly what Nest's ValidationPipe throws", () => {
    const ours = failWith(...errors);
    const theirs = new ValidationPipe({
      whitelist: true,
    }).createExceptionFactory()(errors) as HttpException;
    expect(ours.getStatus()).toBe(theirs.getStatus());
    expect(ours.getResponse()).toEqual(theirs.getResponse());
    expect(ours.message).toBe(theirs.message);
  });

  it('development formatting is the previous behaviour, original messages included', () => {
    const { formatted, error } = nestShaped(failWith(...errors));
    const out = formatGraphQLError(formatted, error, false);
    const { stacktrace: _omitted, ...expectedExtensions } =
      formatted.extensions!;
    expect(out).toEqual({ ...formatted, extensions: expectedExtensions });
    expect(JSON.stringify(out)).toContain('Custom name message SECRET-dev');
  });
});

describe('production logging of suppressed errors', () => {
  const methods = [
    'log',
    'error',
    'warn',
    'debug',
    'verbose',
    'fatal',
  ] as const;
  const spies = () =>
    Object.fromEntries(
      methods.map((m) => [
        m,
        vi.spyOn(Logger.prototype, m).mockImplementation(() => undefined),
      ]),
    ) as unknown as Record<(typeof methods)[number], MockInstance>;

  afterEach(() => vi.restoreAllMocks());

  const SAFE_LINE =
    /^Suppressed GraphQL error detail \(status=\d{3}, category=[a-z_]+, count=\d+\)$/;

  it.each([
    [new BadRequestException('Token SECRET-abc leaked in message'), 400],
    [new UnauthorizedException('Bearer SECRET-jwt rejected'), 401],
    [new ForbiddenException('user SECRET@example.com may not'), 403],
    [new NotFoundException('prisma db.internal:5432 ECONNREFUSED SECRET'), 404],
    [new ConflictException('duplicate key SECRET'), 409],
    [
      new BadRequestException([
        'Password SECRET is weak',
        'x must be a string',
      ]),
      400,
    ],
    [
      failWith(verr('SECRET-field', { isSecretRule: 'Value SECRET rejected' })),
      400,
    ],
  ])('logs only status, category and count for %j', (exception, status) => {
    const log = spies();
    prod(exception);
    expect(log.warn).toHaveBeenCalledTimes(1);
    const lines = log.warn.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(lines[0]).toMatch(SAFE_LINE);
    expect(lines[0]).toContain(`status=${status}`);
    for (const fragment of LEAK_FRAGMENTS) {
      expect(JSON.stringify(log.warn.mock.calls)).not.toContain(fragment);
    }
    for (const m of methods.filter((m) => m !== 'warn')) {
      expect(log[m]).not.toHaveBeenCalled();
    }
  });

  it('does not log public messages, safe validation messages, masked errors or development errors', () => {
    const log = spies();
    prod(new NotFoundException('Project not found'));
    prod(failWith(verr('name', { isNotEmpty: 'SECRET message ignored' })));
    prod(new InternalServerErrorException('db.internal SECRET'));
    prod(new HttpException('SECRET teapot', 418));
    const { formatted, error } = nestShaped(new NotFoundException('SECRET'));
    formatGraphQLError(formatted, error, false);
    for (const m of methods) expect(log[m]).not.toHaveBeenCalled();
  });
});

describe('development behaviour with an untrusted validation message list is unchanged', () => {
  it('passes them through exactly as before (only stacktrace removed)', () => {
    const { formatted, error } = nestShaped(
      new BadRequestException(['Password hunter2 is too weak']),
    );
    const out = formatGraphQLError(formatted, error, false);
    const { stacktrace: _omitted, ...expectedExtensions } =
      formatted.extensions!;
    expect(out).toEqual({ ...formatted, extensions: expectedExtensions });
    expect(JSON.stringify(out)).toContain('hunter2');
  });
});
