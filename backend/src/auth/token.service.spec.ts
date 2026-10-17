import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';

import { TokenService } from './token.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('TokenService', () => {
  let service: TokenService;

  let jwt: {
    signAsync: ReturnType<typeof vi.fn>;
  };

  let config: {
    get: ReturnType<typeof vi.fn>;
  };

  let prisma: {
    refreshToken: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
  };

  const hashToken = (token: string) =>
    createHash('sha256').update(token).digest('hex');

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useRealTimers();

    jwt = {
      signAsync: vi.fn(),
    };

    config = {
      get: vi.fn(),
    };

    prisma = {
      refreshToken: {
        create: vi.fn(),
        findUnique: vi.fn(),
        deleteMany: vi.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(TokenService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('signAccessToken', () => {
    it('should sign an access token containing the user ID as sub', async () => {
      jwt.signAsync.mockResolvedValue('signed-access-token');

      const result = await service.signAccessToken('user-1');

      expect(jwt.signAsync).toHaveBeenCalledWith({
        sub: 'user-1',
      });

      expect(result).toBe('signed-access-token');
    });

    it('should propagate JWT signing errors', async () => {
      jwt.signAsync.mockRejectedValue(new Error('JWT signing failed'));

      await expect(
        service.signAccessToken('user-1'),
      ).rejects.toThrow('JWT signing failed');
    });
  });

  describe('issueRefreshToken', () => {
    it('should generate a random token and store only its SHA-256 hash', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

      config.get.mockReturnValue(7);
      prisma.refreshToken.create.mockResolvedValue({});

      const token = await service.issueRefreshToken('user-1');

      expect(token).toMatch(/^[a-f0-9]{64}$/);

      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);

      const createCall = prisma.refreshToken.create.mock.calls[0][0];

      expect(createCall.data.userId).toBe('user-1');
      expect(createCall.data.tokenHash).toBe(hashToken(token));
      expect(createCall.data.tokenHash).not.toBe(token);

      expect(createCall.data.expiresAt).toEqual(
        new Date('2026-01-08T00:00:00.000Z'),
      );
    });

    it('should use seven days when the TTL configuration is missing', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

      config.get.mockReturnValue(undefined);
      prisma.refreshToken.create.mockResolvedValue({});

      await service.issueRefreshToken('user-1');

      const createCall = prisma.refreshToken.create.mock.calls[0][0];

      expect(config.get).toHaveBeenCalledWith('REFRESH_TOKEN_TTL_DAYS');

      expect(createCall.data.expiresAt).toEqual(
        new Date('2026-01-08T00:00:00.000Z'),
      );
    });

    it('should propagate database errors', async () => {
      prisma.refreshToken.create.mockRejectedValue(
        new Error('Database unavailable'),
      );

      await expect(
        service.issueRefreshToken('user-1'),
      ).rejects.toThrow('Database unavailable');
    });
  });

  describe('consumeRefreshToken', () => {
    it('should return null when the token does not exist', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      const result = await service.consumeRefreshToken('unknown-token');

      expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
        where: {
          tokenHash: hashToken('unknown-token'),
        },
      });

      expect(result).toBeNull();
      expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
    });

    it('should delete a valid token and return its user ID', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

      prisma.refreshToken.findUnique.mockResolvedValue({
        userId: 'user-1',
        expiresAt: new Date('2026-01-08T00:00:00.000Z'),
      });

      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.consumeRefreshToken('valid-token');

      expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
        where: {
          tokenHash: hashToken('valid-token'),
        },
      });

      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: {
          tokenHash: hashToken('valid-token'),
        },
      });

      expect(result).toBe('user-1');
    });

    it('should return null when the token has expired', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-08T00:00:00.000Z'));

      prisma.refreshToken.findUnique.mockResolvedValue({
        userId: 'user-1',
        expiresAt: new Date('2026-01-07T00:00:00.000Z'),
      });

      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.consumeRefreshToken('expired-token');

      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledTimes(1);
      expect(result).toBeNull();
    });

    it('should return null when another request has already consumed the token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 60_000),
      });

      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.consumeRefreshToken('already-used-token');

      expect(result).toBeNull();
    });

    it('should propagate lookup errors', async () => {
      prisma.refreshToken.findUnique.mockRejectedValue(
        new Error('Database unavailable'),
      );

      await expect(
        service.consumeRefreshToken('valid-token'),
      ).rejects.toThrow('Database unavailable');

      expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
    });

    it('should propagate deletion errors', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 60_000),
      });

      prisma.refreshToken.deleteMany.mockRejectedValue(
        new Error('Database unavailable'),
      );

      await expect(
        service.consumeRefreshToken('valid-token'),
      ).rejects.toThrow('Database unavailable');
    });
  });

  describe('revokeRefreshToken', () => {
    it('should delete the refresh token using its hash', async () => {
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

      await service.revokeRefreshToken('refresh-token');

      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: {
          tokenHash: hashToken('refresh-token'),
        },
      });
    });

    it('should succeed when the token does not exist', async () => {
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.revokeRefreshToken('unknown-token'),
      ).resolves.toBeUndefined();
    });

    it('should propagate database errors', async () => {
      prisma.refreshToken.deleteMany.mockRejectedValue(
        new Error('Database unavailable'),
      );

      await expect(
        service.revokeRefreshToken('refresh-token'),
      ).rejects.toThrow('Database unavailable');
    });
  });
});