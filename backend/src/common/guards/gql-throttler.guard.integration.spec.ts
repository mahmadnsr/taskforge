import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  GraphQLModule,
  Query,
  Resolver,
} from '@nestjs/graphql';
import { ApolloDriver } from '@nestjs/apollo';
import type { ApolloDriverConfig } from '@nestjs/apollo';
import { ThrottlerModule } from '@nestjs/throttler';
import { GqlThrottlerGuard } from './gql-throttler.guard.js';

@Resolver()
class ThrottlerProbeResolver {
  @Query(() => String)
  ping() {
    return 'pong';
  }
}

@Module({
  imports: [
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 2 },
    ]),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      context: ({ req }: { req: unknown }) => ({ req }),
    }),
  ],
  providers: [
    ThrottlerProbeResolver,
    { provide: APP_GUARD, useClass: GqlThrottlerGuard },
  ],
})
class ThrottlerProbeModule {}

describe('GqlThrottlerGuard integration', () => {
  let app: INestApplication;
  let url: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerProbeModule],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });

    // Trust forwarded IPs only in this isolated test application.
    app.getHttpAdapter().getInstance().set('trust proxy', true);

    await app.listen(0);

    url = `${(await app.getUrl()).replace('[::1]', 'localhost')}/graphql`;
  });

  afterAll(async () => {
    await app.close();
  });

  async function sendPing(clientIp = '198.51.100.10') {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': clientIp,
      },
      body: JSON.stringify({ query: '{ ping }' }),
    });

    const body = (await response.json()) as {
      data?: { ping?: string };
      errors?: Array<{
        message: string;
        extensions?: Record<string, unknown>;
      }>;
    };

    return { status: response.status, body };
  }

  it('allows requests within the limit and blocks the next request', async () => {
    const first = await sendPing();
    expect(first.body.data?.ping).toBe('pong');
    expect(first.body.errors).toBeUndefined();

    const second = await sendPing();
    expect(second.body.data?.ping).toBe('pong');
    expect(second.body.errors).toBeUndefined();

    const third = await sendPing();
    expect(third.body.errors?.[0]?.message).toBe(
      'Too many requests, please try again later',
    );
    expect(third.body.errors?.[0]?.extensions?.code).toBe(
      'TOO_MANY_REQUESTS',
    );

    // A different client IP should have an independent rate-limit bucket.
    const differentClient = await sendPing('203.0.113.20');
    expect(differentClient.body.data?.ping).toBe('pong');
    expect(differentClient.body.errors).toBeUndefined();
  });
});
