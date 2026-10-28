import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { AuthService } from './auth.service.js';
import { TokenService } from './token.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { OrganizationsService } from '../organizations/organizations.service.js';
import { InvitationsService } from '../organizations/invitations.service.js';
import { RegisterWithInvitationInput } from './dto/register-with-invitation.input.js';

describe('AuthService', () => {
  let service: AuthService;

  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
  };

  let usersService: {
    findByEmail: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };

  let organizationsService: {
    createWithAdmin: ReturnType<typeof vi.fn>;
  };

  let invitationsService: {
    acceptInvitationInTransaction: ReturnType<typeof vi.fn>;
  };

  let tokenService: {
    signAccessToken: ReturnType<typeof vi.fn>;
    issueRefreshToken: ReturnType<typeof vi.fn>;
    consumeRefreshToken: ReturnType<typeof vi.fn>;
    getRefreshTokenUserId: ReturnType<typeof vi.fn>;
    rotateRefreshToken: ReturnType<typeof vi.fn>;
    revokeRefreshToken: ReturnType<typeof vi.fn>;
  };

  const user = {
    id: 'user-1',
    name: 'Ahmad',
    email: 'ahmad@example.com',
    passwordHash: 'hashed-password',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    prisma = {
      $transaction: vi.fn(),
    };

    usersService = {
      findByEmail: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
    };

    organizationsService = {
      createWithAdmin: vi.fn(),
    };

    invitationsService = {
      acceptInvitationInTransaction: vi.fn(),
    };

    tokenService = {
      signAccessToken: vi.fn(),
      issueRefreshToken: vi.fn(),
      consumeRefreshToken: vi.fn(),
      getRefreshTokenUserId: vi.fn(),
      rotateRefreshToken: vi.fn(),
      revokeRefreshToken: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: usersService },
        { provide: OrganizationsService, useValue: organizationsService },
        { provide: InvitationsService, useValue: invitationsService },
        { provide: TokenService, useValue: tokenService },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('register', () => {
    const input = {
      name: 'Ahmad',
      email: '  AHMAD@EXAMPLE.COM  ',
      password: 'StrongPassword123!',
      organizationName: 'TaskForge Team',
    };

    it('should normalize email and create user and organization in a transaction', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(user);

      organizationsService.createWithAdmin.mockResolvedValue({
        id: 'org-1',
        name: 'TaskForge Team',
      });

      prisma.$transaction.mockImplementation(
        async (callback: (tx: object) => Promise<unknown>) =>
          callback({ user: {}, organization: {} }),
      );

      const result = await service.register(input);

      expect(usersService.findByEmail).toHaveBeenCalledWith(
        'ahmad@example.com',
      );

      expect(usersService.create).toHaveBeenCalledTimes(1);

      const createCall = usersService.create.mock.calls[0];

      expect(createCall[1]).toMatchObject({
        name: 'Ahmad',
        email: 'ahmad@example.com',
      });

      expect(createCall[1].passwordHash).not.toBe(input.password);

      expect(
        await bcrypt.compare(input.password, createCall[1].passwordHash),
      ).toBe(true);

      expect(organizationsService.createWithAdmin).toHaveBeenCalledWith(
        createCall[0],
        'TaskForge Team',
        user.id,
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result).toEqual(user);
    });

    it('should reject registration when email already exists', async () => {
      usersService.findByEmail.mockResolvedValue(user);

      await expect(service.register(input)).rejects.toThrow(
        ConflictException,
      );

      expect(usersService.findByEmail).toHaveBeenCalledWith(
        'ahmad@example.com',
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('should convert Prisma P2002 into a conflict exception', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['email'] },
        },
      );

      prisma.$transaction.mockRejectedValue(prismaError);

      await expect(service.register(input)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should propagate unexpected transaction errors', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      const error = new Error('Database unavailable');

      prisma.$transaction.mockRejectedValue(error);

      await expect(service.register(input)).rejects.toThrow(
        'Database unavailable',
      );
    });
  });

  describe('registerWithInvitation', () => {
    const input: RegisterWithInvitationInput = {
      name: 'Ahmad',
      email: '  AHMAD@EXAMPLE.COM  ',
      password: 'StrongPassword123!',
      invitationToken: 'valid-invitation-token',
    };

    const tx = {
      user: {},
      organizationInvitation: {},
      organizationMember: {},
    };

    beforeEach(() => {
      usersService.findByEmail.mockResolvedValue(null);

      usersService.create.mockResolvedValue(user);

      invitationsService.acceptInvitationInTransaction.mockResolvedValue({
        id: 'org-1',
        name: 'TaskForge Team',
      });

      prisma.$transaction.mockImplementation(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      );
    });

    it('should normalize email and create the user and accept the invitation in one transaction', async () => {
      const result = await service.registerWithInvitation(input);

      expect(usersService.findByEmail).toHaveBeenCalledWith(
        'ahmad@example.com',
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      expect(usersService.create).toHaveBeenCalledTimes(1);

      const [transaction, createInput] = usersService.create.mock.calls[0];

      expect(transaction).toBe(tx);

      expect(createInput).toMatchObject({
        name: 'Ahmad',
        email: 'ahmad@example.com',
      });

      expect(createInput.passwordHash).not.toBe(input.password);

      expect(
        await bcrypt.compare(input.password, createInput.passwordHash),
      ).toBe(true);

      expect(
        invitationsService.acceptInvitationInTransaction,
      ).toHaveBeenCalledTimes(1);

      expect(
        invitationsService.acceptInvitationInTransaction,
      ).toHaveBeenCalledWith(
        tx,
        user.id,
        'ahmad@example.com',
        input.invitationToken,
      );

      expect(result).toEqual(user);
    });

    it('should reject registration when the email already exists', async () => {
      usersService.findByEmail.mockResolvedValue(user);

      await expect(service.registerWithInvitation(input)).rejects.toThrow(
        ConflictException,
      );

      expect(usersService.findByEmail).toHaveBeenCalledWith(
        'ahmad@example.com',
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(usersService.create).not.toHaveBeenCalled();

      expect(
        invitationsService.acceptInvitationInTransaction,
      ).not.toHaveBeenCalled();
    });

    it('should reject registration when invitation acceptance fails', async () => {
      invitationsService.acceptInvitationInTransaction.mockRejectedValue(
        new Error('Invitation is invalid or expired'),
      );

      await expect(service.registerWithInvitation(input)).rejects.toThrow(
        'Invitation is invalid or expired',
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(usersService.create).toHaveBeenCalledTimes(1);

      expect(
        invitationsService.acceptInvitationInTransaction,
      ).toHaveBeenCalledWith(
        tx,
        user.id,
        'ahmad@example.com',
        input.invitationToken,
      );
    });

    it('should convert a Prisma P2002 error into a conflict exception', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['email'] },
        },
      );

      prisma.$transaction.mockRejectedValue(prismaError);

      await expect(service.registerWithInvitation(input)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should propagate unexpected transaction errors', async () => {
      prisma.$transaction.mockRejectedValue(
        new Error('Database unavailable'),
      );

      await expect(service.registerWithInvitation(input)).rejects.toThrow(
        'Database unavailable',
      );
    });
  });

  describe('login', () => {
    const input = {
      email: '  AHMAD@EXAMPLE.COM ',
      password: 'StrongPassword123!',
    };

    let validUser: typeof user;

    beforeEach(async () => {
      validUser = {
        ...user,
        passwordHash: await bcrypt.hash(input.password, 4),
      };
    });

    it('should return access token, refresh token and user for valid credentials', async () => {
      usersService.findByEmail.mockResolvedValue(validUser);
      tokenService.signAccessToken.mockResolvedValue('access-token');
      tokenService.issueRefreshToken.mockResolvedValue('refresh-token');

      const result = await service.login(input);

      expect(usersService.findByEmail).toHaveBeenCalledWith(
        'ahmad@example.com',
      );

      expect(tokenService.signAccessToken).toHaveBeenCalledWith(user.id);
      expect(tokenService.issueRefreshToken).toHaveBeenCalledWith(user.id);

      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: validUser,
      });
    });

    it('should reject login when the user does not exist', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(service.login(input)).rejects.toThrow(
        UnauthorizedException,
      );

      expect(tokenService.signAccessToken).not.toHaveBeenCalled();
      expect(tokenService.issueRefreshToken).not.toHaveBeenCalled();
    });

    it('should reject login when the password is incorrect', async () => {
      usersService.findByEmail.mockResolvedValue(validUser);

      await expect(
        service.login({
          ...input,
          password: 'WrongPassword123!',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(tokenService.signAccessToken).not.toHaveBeenCalled();
      expect(tokenService.issueRefreshToken).not.toHaveBeenCalled();
    });

    it('should propagate an access-token signing error', async () => {
      usersService.findByEmail.mockResolvedValue(validUser);

      tokenService.signAccessToken.mockRejectedValue(
        new Error('JWT signing failed'),
      );

      await expect(service.login(input)).rejects.toThrow(
        'JWT signing failed',
      );

      expect(tokenService.issueRefreshToken).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('should rotate refresh token and return new tokens for a valid token', async () => {
      tokenService.getRefreshTokenUserId.mockResolvedValue(user.id);
      usersService.findById.mockResolvedValue(user);
      tokenService.signAccessToken.mockResolvedValue('new-access-token');
      tokenService.rotateRefreshToken.mockResolvedValue({
        userId: user.id,
        refreshToken: 'new-refresh-token',
      });

      const result = await service.refresh('old-refresh-token');

      expect(tokenService.getRefreshTokenUserId).toHaveBeenCalledWith(
        'old-refresh-token',
      );
      expect(usersService.findById).toHaveBeenCalledWith(user.id);
      expect(tokenService.signAccessToken).toHaveBeenCalledWith(user.id);
      expect(tokenService.rotateRefreshToken).toHaveBeenCalledWith(
        'old-refresh-token',
      );

      expect(tokenService.getRefreshTokenUserId.mock.invocationCallOrder[0])
        .toBeLessThan(usersService.findById.mock.invocationCallOrder[0]);
      expect(usersService.findById.mock.invocationCallOrder[0])
        .toBeLessThan(tokenService.signAccessToken.mock.invocationCallOrder[0]);
      expect(tokenService.signAccessToken.mock.invocationCallOrder[0])
        .toBeLessThan(tokenService.rotateRefreshToken.mock.invocationCallOrder[0]);

      expect(tokenService.consumeRefreshToken).not.toHaveBeenCalled();
      expect(tokenService.issueRefreshToken).not.toHaveBeenCalled();

      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        user,
      });
    });

    it('should reject an invalid or expired refresh token', async () => {
      tokenService.getRefreshTokenUserId.mockResolvedValue(null);

      await expect(
        service.refresh('invalid-refresh-token'),
      ).rejects.toThrow(UnauthorizedException);

      expect(tokenService.getRefreshTokenUserId).toHaveBeenCalledWith(
        'invalid-refresh-token',
      );
      expect(usersService.findById).not.toHaveBeenCalled();
      expect(tokenService.signAccessToken).not.toHaveBeenCalled();
      expect(tokenService.rotateRefreshToken).not.toHaveBeenCalled();
    });

    it('should reject refresh when the user no longer exists', async () => {
      tokenService.getRefreshTokenUserId.mockResolvedValue('deleted-user');
      usersService.findById.mockResolvedValue(null);

      await expect(
        service.refresh('old-refresh-token'),
      ).rejects.toThrow(UnauthorizedException);

      expect(usersService.findById).toHaveBeenCalledWith('deleted-user');
      expect(tokenService.signAccessToken).not.toHaveBeenCalled();
      expect(tokenService.rotateRefreshToken).not.toHaveBeenCalled();
    });

    it('should propagate an error when refresh-token rotation fails', async () => {
      tokenService.getRefreshTokenUserId.mockResolvedValue(user.id);
      usersService.findById.mockResolvedValue(user);
      tokenService.signAccessToken.mockResolvedValue('new-access-token');
      tokenService.rotateRefreshToken.mockRejectedValue(
        new Error('Token storage failed'),
      );

      await expect(
        service.refresh('old-refresh-token'),
      ).rejects.toThrow('Token storage failed');

      expect(tokenService.signAccessToken).toHaveBeenCalledWith(user.id);
      expect(tokenService.rotateRefreshToken).toHaveBeenCalledWith(
        'old-refresh-token',
      );
    });

    it('should propagate an access-token signing error before rotation', async () => {
      tokenService.getRefreshTokenUserId.mockResolvedValue(user.id);
      usersService.findById.mockResolvedValue(user);
      tokenService.signAccessToken.mockRejectedValue(
        new Error('JWT signing failed'),
      );

      await expect(
        service.refresh('old-refresh-token'),
      ).rejects.toThrow('JWT signing failed');

      expect(tokenService.rotateRefreshToken).not.toHaveBeenCalled();
    });

    it('should reject if another request consumes the token before rotation', async () => {
      tokenService.getRefreshTokenUserId.mockResolvedValue(user.id);
      usersService.findById.mockResolvedValue(user);
      tokenService.signAccessToken.mockResolvedValue('new-access-token');
      tokenService.rotateRefreshToken.mockResolvedValue(null);

      await expect(
        service.refresh('old-refresh-token'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should revoke the refresh token and return true', async () => {
      tokenService.revokeRefreshToken.mockResolvedValue(undefined);

      const result = await service.logout('refresh-token');

      expect(tokenService.revokeRefreshToken).toHaveBeenCalledWith(
        'refresh-token',
      );

      expect(result).toBe(true);
    });

    it('should propagate a revocation error', async () => {
      tokenService.revokeRefreshToken.mockRejectedValue(
        new Error('Database unavailable'),
      );

      await expect(
        service.logout('refresh-token'),
      ).rejects.toThrow('Database unavailable');
    });
  });

  describe('me', () => {
    it('should return the user when found', async () => {
      usersService.findById.mockResolvedValue(user);

      const result = await service.me(user.id);

      expect(usersService.findById).toHaveBeenCalledWith(user.id);
      expect(result).toEqual(user);
    });

    it('should reject when the user does not exist', async () => {
      usersService.findById.mockResolvedValue(null);

      await expect(
        service.me('missing-user'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
