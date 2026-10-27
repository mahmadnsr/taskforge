import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { TokenService } from './token.service.js';

const enabled = process.env.RUN_AUTH_DB_INTEGRATION === '1';

describe.skipIf(!enabled)('TokenService PostgreSQL integration', () => {
  let prisma: PrismaService;
  let tokenService: TokenService;
  const createdUserIds: string[] = [];

  const triggerName = 'auth_rotation_failure_test_trigger';
  const functionName = 'auth_rotation_failure_test_function';

  async function createTestUser() {
    const user = await prisma.user.create({
      data: {
        name: 'Refresh Token Integration Test',
        email: `refresh-token-test-${randomUUID()}@example.test`,
        passwordHash: 'integration-test-only',
      },
    });

    createdUserIds.push(user.id);
    return user;
  }

  async function removeFailureTrigger() {
    await prisma.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS "${triggerName}" ON public."RefreshToken"`,
    );
    await prisma.$executeRawUnsafe(
      `DROP FUNCTION IF EXISTS public."${functionName}"()`,
    );
  }

  beforeAll(async () => {
    const urlText = process.env.DATABASE_URL;
    if (!urlText) throw new Error('DATABASE_URL must be set for this test.');

    const url = new URL(urlText);
    if (
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      url.port !== '5433' ||
      url.pathname !== '/taskforge_auth_test'
    ) {
      throw new Error(
        'Safety check failed: test must target localhost:5433/taskforge_auth_test.',
      );
    }

    prisma = new PrismaService();
    await prisma.$connect();

    tokenService = new TokenService(
      {} as JwtService,
      { get: () => 7 } as unknown as ConfigService,
      prisma,
    );

    await removeFailureTrigger();
  });

  afterAll(async () => {
    if (!prisma) return;

    try {
      await removeFailureTrigger();

      for (const userId of createdUserIds) {
        await prisma.refreshToken.deleteMany({ where: { userId } });
        await prisma.user.deleteMany({ where: { id: userId } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it('allows exactly one of two concurrent rotations to succeed', async () => {
    const user = await createTestUser();
    const originalToken = await tokenService.issueRefreshToken(user.id);

    const results = await Promise.all([
      tokenService.rotateRefreshToken(originalToken),
      tokenService.rotateRefreshToken(originalToken),
    ]);

    expect(results.filter((result) => result !== null)).toHaveLength(1);
    expect(results.filter((result) => result === null)).toHaveLength(1);

    expect(
      await tokenService.getRefreshTokenUserId(originalToken),
    ).toBeNull();

    const successfulRotation = results.find(
      (result) => result !== null,
    );

    expect(successfulRotation?.userId).toBe(user.id);
    expect(
      await tokenService.getRefreshTokenUserId(
        successfulRotation!.refreshToken,
      ),
    ).toBe(user.id);

    const remainingTokens = await prisma.refreshToken.count({
      where: { userId: user.id },
    });
    expect(remainingTokens).toBe(1);
  });

  it('preserves the original token if inserting the replacement fails', async () => {
    const user = await createTestUser();
    const originalToken = await tokenService.issueRefreshToken(user.id);

    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION public."${functionName}"()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $body$
      BEGIN
        RAISE EXCEPTION 'controlled integration-test insert failure';
      END;
      $body$;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "${triggerName}"
      BEFORE INSERT ON public."RefreshToken"
      FOR EACH ROW
      EXECUTE FUNCTION public."${functionName}"();
    `);

    await expect(
      tokenService.rotateRefreshToken(originalToken),
    ).rejects.toThrow();

    // Remove the trigger before checking/cleaning up records.
    await removeFailureTrigger();

    // The deletion must have rolled back with the failed insertion.
    expect(
      await tokenService.getRefreshTokenUserId(originalToken),
    ).toBe(user.id);

    expect(
      await prisma.refreshToken.count({ where: { userId: user.id } }),
    ).toBe(1);
  });
});
