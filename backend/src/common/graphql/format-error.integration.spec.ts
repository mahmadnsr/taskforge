import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Module,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  Args,
  Field,
  GraphQLModule,
  InputType,
  Int,
  Mutation,
  Query,
  Resolver,
} from '@nestjs/graphql';
import { ApolloDriver } from '@nestjs/apollo';
import type { ApolloDriverConfig } from '@nestjs/apollo';
import { IsEmail, MaxLength, MinLength } from 'class-validator';
import { GraphQLError } from 'graphql';
import { formatGraphQLError } from './format-error.js';
import { RegisterInput } from '../../auth/dto/register.input.js';
import { SafeValidationPipe } from './safe-validation.js';

/**
 * These tests start a real Nest + Apollo server (no database needed) and read
 * the actual HTTP/GraphQL response, using the same wiring as app.module.ts:
 *   formatError: (formattedError, error) => formatGraphQLError(...)
 */

class PrismaLikeError extends Error {
  code = 'P2002';
  meta = { target: ['email'] };
  constructor() {
    super(
      'Invalid `prisma.user.create()` invocation: Unique constraint failed at db.internal:5432',
    );
  }
}

/**
 * A DTO whose custom messages look like the default ones but contain the
 * submitted value (or an unapproved field name).
 */
@InputType()
class LeakyMessageInput {
  @Field()
  @MaxLength(5, {
    message: (a) =>
      `name must be shorter than or equal to 5 characters: ${String(a.value)}`,
  })
  name!: string;

  @Field()
  @IsEmail({}, { message: (a) => `${String(a.value)} must be an email` })
  email!: string;

  @Field()
  @MinLength(8, {
    message: (a) =>
      `password must be longer than or equal to 8 characters, got ${String(a.value)}`,
  })
  password!: string;

  @Field()
  @MinLength(50, { message: 'secretNote SECRET-note must be a string' })
  secretNote!: string;
}

@Resolver()
class ProbeResolver {
  @Query(() => String) bad() {
    throw new BadRequestException('Name cannot be empty');
  }
  @Query(() => String) badList() {
    throw new BadRequestException(['organizationId must be a UUID']);
  }
  @Query(() => String) unauth() {
    throw new UnauthorizedException();
  }
  @Query(() => String) forbidden() {
    throw new ForbiddenException('Insufficient role');
  }
  @Query(() => String) notFound() {
    throw new NotFoundException('Project not found');
  }
  @Query(() => String) conflict() {
    throw new ConflictException('Email already registered');
  }
  @Query(() => String) leaky() {
    throw new NotFoundException('User row 42 missing (db.internal)');
  }
  @Query(() => String) teapot() {
    throw new HttpException('internal 418 detail', 418);
  }
  @Query(() => String) boom() {
    throw new Error('connect ECONNREFUSED db.internal:5432');
  }
  @Query(() => String) prismaErr() {
    throw new PrismaLikeError();
  }
  @Query(() => String) throttled() {
    throw new GraphQLError('Too many requests, please try again later', {
      extensions: { code: 'TOO_MANY_REQUESTS' },
    });
  }
  @Query(() => String) withInt(@Args('x', { type: () => Int }) x: number) {
    return String(x);
  }
  @Mutation(() => String)
  leakyRegister(
    @Args('input', { type: () => LeakyMessageInput }) input: LeakyMessageInput,
  ) {
    return input.email;
  }
  @Mutation(() => String)
  register(@Args('input', { type: () => RegisterInput }) input: RegisterInput) {
    return input.email;
  }
}

function moduleFor(isProduction: boolean) {
  @Module({
    imports: [
      GraphQLModule.forRoot<ApolloDriverConfig>({
        driver: ApolloDriver,
        autoSchemaFile: true,
        // worst case: Apollo itself adds stack traces and the original error
        includeStacktraceInErrorResponses: true,
        formatError: (formattedError, error) =>
          formatGraphQLError(formattedError, error, isProduction),
      }),
    ],
    providers: [ProbeResolver],
  })
  class ProbeModule {}
  return ProbeModule;
}

type Server = { app: INestApplication; url: string };

async function start(
  isProduction: boolean,
  pipe: ValidationPipe = new SafeValidationPipe({ whitelist: true }),
): Promise<Server> {
  const moduleRef = await Test.createTestingModule({
    imports: [moduleFor(isProduction)],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.useGlobalPipes(pipe);
  await app.listen(0);
  const base = (await app.getUrl()).replace('[::1]', 'localhost');
  return { app, url: `${base}/graphql` };
}

async function send(
  server: Server,
  query: string,
  variables?: Record<string, unknown>,
) {
  const res = await fetch(server.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json()) as { errors?: Array<Record<string, any>> };
  return {
    status: res.status,
    error: body.errors?.[0] as Record<string, any>,
    raw: JSON.stringify(body),
  };
}

const LEAKS = [
  'originalError',
  'stacktrace',
  'statusCode',
  'db.internal',
  'ECONNREFUSED',
  'prisma',
  'P2002',
  'SECRET',
  'Did you mean',
];

describe('production responses from a real Nest + Apollo server', () => {
  let server: Server;
  beforeAll(async () => {
    server = await start(true);
  });
  afterAll(async () => {
    await server.app.close();
  });

  const expectClean = (raw: string) => {
    for (const l of LEAKS) expect(raw).not.toContain(l);
  };
  const run = (field: string) => send(server, `{ ${field} }`);

  it('400 with a public message', async () => {
    const { error, raw } = await run('bad');
    expect(error.message).toBe('Name cannot be empty');
    expect(error.extensions).toEqual({ code: 'BAD_REQUEST' });
    expectClean(raw);
  });

  it('a message list thrown by a resolver (not by SafeValidationPipe) is untrusted: fallback only', async () => {
    const { error, raw } = await run('badList');
    expect(error.message).toBe('Bad Request Exception');
    expect(error.extensions).toEqual({
      code: 'BAD_REQUEST',
      validationErrors: ['One or more fields are invalid'],
    });
    expect(raw).not.toContain('organizationId');
    expectClean(raw);
  });

  it('401', async () => {
    const { error, raw } = await run('unauth');
    expect(error.message).toBe('Unauthorized');
    expect(error.extensions).toEqual({ code: 'UNAUTHENTICATED' });
    expectClean(raw);
  });

  it('403', async () => {
    const { error, raw } = await run('forbidden');
    expect(error.message).toBe('Insufficient role');
    expect(error.extensions).toEqual({ code: 'FORBIDDEN' });
    expectClean(raw);
  });

  it('404 "Project not found" stays visible although Nest labels it INTERNAL_SERVER_ERROR', async () => {
    const { error, raw } = await run('notFound');
    expect(error.message).toBe('Project not found');
    expect(error.extensions).toEqual({ code: 'NOT_FOUND' });
    expectClean(raw);
  });

  it('409 "Email already registered" stays visible', async () => {
    const { error, raw } = await run('conflict');
    expect(error.message).toBe('Email already registered');
    expect(error.extensions).toEqual({ code: 'CONFLICT' });
    expectClean(raw);
  });

  it('404 with a message that is not public gets a generic text', async () => {
    const { error, raw } = await run('leaky');
    expect(error.message).toBe('Not found');
    expect(error.extensions).toEqual({ code: 'NOT_FOUND' });
    expectClean(raw);
  });

  it.each(['teapot', 'boom', 'prismaErr'])('%s is masked', async (field) => {
    const { error, raw } = await run(field);
    expect(error).toEqual({
      message: 'Internal server error',
      extensions: { code: 'INTERNAL_SERVER_ERROR' },
    });
    expectClean(raw);
  });

  it('throttler error keeps its fixed message and code', async () => {
    const { error, raw } = await run('throttled');
    expect(error.message).toBe('Too many requests, please try again later');
    expect(error.extensions).toEqual({ code: 'TOO_MANY_REQUESTS' });
    expectClean(raw);
  });

  it('Apollo validation error does not leak schema hints', async () => {
    const { error, raw } = await run('forbiddn'); // typo of "forbidden" -> graphql-js adds 'Did you mean "forbidden"?'
    expect(error.message).toBe('GraphQL validation failed');
    expect(error.extensions).toEqual({ code: 'GRAPHQL_VALIDATION_FAILED' });
    expectClean(raw);
  });

  it('Apollo parse error is replaced by a fixed message', async () => {
    const { error } = await send(server, '{ SECRET ');
    expect(error.message).toBe('Invalid GraphQL query');
    expect(error.extensions).toEqual({ code: 'GRAPHQL_PARSE_FAILED' });
  });

  it('BAD_USER_INPUT does not echo the submitted value', async () => {
    const { error, raw } = await send(
      server,
      'query($x: Int!) { withInt(x: $x) }',
      { x: 'SECRET' },
    );
    expect(error.message).toBe('Invalid input');
    expect(error.extensions).toEqual({ code: 'BAD_USER_INPUT' });
    expectClean(raw);
  });

  it('ValidationPipe on a real DTO: field messages only, submitted secrets are not echoed', async () => {
    const { error, raw } = await send(
      server,
      'mutation($input: RegisterInput!) { register(input: $input) }',
      {
        input: {
          name: 'SECRET_' + 'x'.repeat(200),
          email: 'SECRET-not-an-email',
          password: 'SECRET',
          organizationName: 'ok',
        },
      },
    );
    expect(error.extensions.code).toBe('BAD_REQUEST');
    expect(error.extensions.validationErrors.length).toBeGreaterThan(0);
    expectClean(raw);
  });

  it('look-alike custom messages with submitted values: only generated text, unapproved field gets the fallback', async () => {
    const { error, raw } = await send(
      server,
      'mutation($input: LeakyMessageInput!) { leakyRegister(input: $input) }',
      {
        input: {
          name: 'SECRET-name-value',
          email: 'SECRET-email-value',
          password: 'SECRET',
          secretNote: 'SECRET-note-value',
        },
      },
    );
    expect(error.message).toBe('Bad Request Exception');
    expect(error.extensions).toEqual({
      code: 'BAD_REQUEST',
      validationErrors: [
        'name is too long',
        'email must be an email',
        'password is too short',
        'One or more fields are invalid',
      ],
    });
    expectClean(raw);
    for (const fragment of ['SECRET', 'got ', 'secretNote']) {
      expect(raw).not.toContain(fragment);
    }
  });

  it('default messages of a real DTO stay useful in the response', async () => {
    const { error } = await send(
      server,
      'mutation($input: RegisterInput!) { register(input: $input) }',
      {
        input: {
          name: '',
          email: 'SECRET-not-an-email',
          password: 'SECRET',
          organizationName: 'ok',
        },
      },
    );
    expect(error.extensions.validationErrors).toEqual([
      'name should not be empty',
      'email must be an email',
      'password is too short',
    ]);
  });
});

describe('a plain ValidationPipe (not SafeValidationPipe) in production', () => {
  let server: Server;
  beforeAll(async () => {
    server = await start(true, new ValidationPipe({ whitelist: true }));
  });
  afterAll(async () => {
    await server.app.close();
  });

  it('fails safe: only the fixed fallback is returned', async () => {
    const { error, raw } = await send(
      server,
      'mutation($input: LeakyMessageInput!) { leakyRegister(input: $input) }',
      {
        input: {
          name: 'SECRET-name-value',
          email: 'SECRET-email-value',
          password: 'SECRET',
          secretNote: 'x',
        },
      },
    );
    expect(error.extensions).toEqual({
      code: 'BAD_REQUEST',
      validationErrors: ['One or more fields are invalid'],
    });
    for (const fragment of ['originalError', 'stacktrace', 'SECRET']) {
      expect(raw).not.toContain(fragment);
    }
  });
});

describe('development responses are unchanged', () => {
  let server: Server;
  beforeAll(async () => {
    server = await start(false);
  });
  afterAll(async () => {
    await server.app.close();
  });

  it('404 keeps its message, INTERNAL_SERVER_ERROR code and status (existing behaviour)', async () => {
    const { error } = await send(server, '{ notFound }');
    expect(error.message).toBe('Project not found');
    expect(error.extensions.code).toBe('INTERNAL_SERVER_ERROR');
    expect(error.extensions.status).toBe(404);
    expect(error.extensions.stacktrace).toBeUndefined();
  });

  it('403 keeps FORBIDDEN and originalError', async () => {
    const { error } = await send(server, '{ forbidden }');
    expect(error.extensions.code).toBe('FORBIDDEN');
    expect(error.extensions.originalError).toBeDefined();
  });

  it('unexpected errors keep their real message', async () => {
    const { error } = await send(server, '{ boom }');
    expect(error.message).toContain('ECONNREFUSED');
  });
});
