import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hashPassword, verifyPassword, verifyDummyPassword } from './password.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { OrganizationsService } from '../organizations/organizations.service.js';
import { InvitationsService } from '../organizations/invitations.service.js';
import { RegisterInput } from './dto/register.input.js';
import { RegisterWithInvitationInput } from './dto/register-with-invitation.input.js';
import { LoginInput } from './dto/login.input.js';
import { TokenService } from './token.service.js';

// User na mile tab bhi bcrypt chalane ke liye (timing attack se bachav)
@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
    private organizationsService: OrganizationsService,
    private tokenService: TokenService,
    private invitationsService: InvitationsService,
  ) {}

  async register(input: RegisterInput) {
    const email = input.email.trim().toLowerCase();

    const existing = await this.usersService.findByEmail(email);

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await hashPassword(input.password);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await this.usersService.create(tx, {
          name: input.name.trim(),
          email,
          passwordHash,
        });

        await this.organizationsService.createWithAdmin(
          tx,
          input.organizationName.trim(),
          user.id,
        );

        return user;
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Email already registered');
      }

      throw e;
    }
  }

  async registerWithInvitation(input: RegisterWithInvitationInput) {
    const email = input.email.trim().toLowerCase();

    const existing = await this.usersService.findByEmail(email);

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await hashPassword(input.password);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await this.usersService.create(tx, {
          name: input.name.trim(),
          email,
          passwordHash,
        });

        await this.invitationsService.acceptInvitationInTransaction(
          tx,
          user.id,
          email,
          input.invitationToken,
        );

        return user;
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Email already registered');
      }

      throw e;
    }
  }

  async login(input: LoginInput) {
    const email = input.email.trim().toLowerCase();
    const user = await this.usersService.findByEmail(email);

    const valid = user
      ? await verifyPassword(input.password, user.passwordHash)
      : (await verifyDummyPassword(input.password), false);

    if (!user || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const accessToken = await this.tokenService.signAccessToken(user.id);
    const refreshToken = await this.tokenService.issueRefreshToken(user.id);

    return { accessToken, refreshToken, user };
  }

  async refresh(refreshToken: string) {
    const userId =
      await this.tokenService.getRefreshTokenUserId(refreshToken);

    if (!userId) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Complete fallible user lookup and JWT signing before token rotation.
    const accessToken = await this.tokenService.signAccessToken(user.id);

    // Atomic one-time-use check: concurrent replays must fail.
    const rotation =
      await this.tokenService.rotateRefreshToken(refreshToken);

    if (!rotation) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return {
      accessToken,
      refreshToken: rotation.refreshToken,
      user,
    };
  }

  async logout(refreshToken: string) {
    await this.tokenService.revokeRefreshToken(refreshToken);
    return true;
  }

  async me(userId: string) {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException();
    }

    return user;
  }
}
