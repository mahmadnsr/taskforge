import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  GraphQLModule,
  Query,
  Resolver,
} from '@nestjs/graphql';
import { ApolloDriver } from '@nestjs/apollo';
import type { ApolloDriverConfig } from '@nestjs/apollo';

@Resolver()
class ProxyProbeResolver {
  @Query(() => String)
  ping() {
    return 'pong';
  }
}

/**
 * Replicates the trust-proxy configuration logic from main.ts so the test
 * verifies the actual Express setting that results from each TRUST_PROXY value.
 */
function applyTrustProxy(app: INestApplication, trustProxy: string | undefined) {
  if (!trustProxy) return;
  const raw = trustProxy.trim();
  const expressApp = app.getHttpAdapter().getInstance();
  if (raw === 'loopback') {
    expressApp.set('trust proxy', raw);
  } else {
    expressApp.set('trust proxy', raw.split(',').map((p) => p.trim()));
  }
}

async function buildApp(trustProxy: string | undefined) {
  @Module({
    imports: [
      GraphQLModule.forRoot<ApolloDriverConfig>({
        driver: ApolloDriver,
        autoSchemaFile: true,
        context: ({ req }: { req: unknown }) => ({ req }),
      }),
    ],
    providers: [ProxyProbeResolver],
  })
  class ProxyProbeModule {}

  const moduleRef = await Test.createTestingModule({
    imports: [ProxyProbeModule],
  }).compile();

  const app = moduleRef.createNestApplication({ logger: false });
  applyTrustProxy(app, trustProxy);
  await app.init();
  const expressApp = app.getHttpAdapter().getInstance();
  const trustProxySetting = expressApp.get('trust proxy');
  await app.close();

  return { trustProxySetting };
}

describe('Express trust proxy configuration', () => {
  it('defaults to false when TRUST_PROXY is unset', async () => {
    const { trustProxySetting } = await buildApp(undefined);
    expect(trustProxySetting).toBe(false);
  });

  it('sets trust proxy to loopback when TRUST_PROXY=loopback', async () => {
    const { trustProxySetting } = await buildApp('loopback');
    expect(trustProxySetting).toBe('loopback');
  });

  it('sets trust proxy to an array when TRUST_PROXY is an IP', async () => {
    const { trustProxySetting } = await buildApp('127.0.0.1');
    expect(trustProxySetting).toEqual(['127.0.0.1']);
  });

  it('sets trust proxy to an array when TRUST_PROXY=::ffff:127.0.0.1', async () => {
    const { trustProxySetting } = await buildApp('::ffff:127.0.0.1');
    expect(trustProxySetting).toEqual(['::ffff:127.0.0.1']);
  });

  it('sets trust proxy to the IP list when TRUST_PROXY is an IP list', async () => {
    const { trustProxySetting } = await buildApp('10.0.0.0/8,172.16.0.0/12');
    expect(trustProxySetting).toEqual(['10.0.0.0/8', '172.16.0.0/12']);
  });
});
