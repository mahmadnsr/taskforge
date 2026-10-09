import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { OrganizationsService } from '../organizations/organizations.service.js';
import { RegisterInput } from './dto/register.input.js';
import { LoginInput } from './dto/login.input.js';
import { TokenService } from './token.service.js';

// User na mile tab bhi bcrypt chalane ke liye (timing attack se bachav)
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
    private organizationsService: OrganizationsService,
    private tokenService: TokenService,
  ) {}

  async register(input: RegisterInput) {
    const email = input.email.toLowerCase().trim();

    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await this.usersService.create(tx, {
          name: input.name,
          email,
          passwordHash,
        });
        await this.organizationsService.createWithAdmin(
          tx,
          input.organizationName,
          user.id,
        );
        return user;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Email already registered');
      }
      throw e;
    }
  }

  async login(input: LoginInput) {
    const email = input.email.toLowerCase().trim();
    const user = await this.usersService.findByEmail(email);

    const valid = await bcrypt.compare(
      input.password,
      user?.passwordHash ?? DUMMY_HASH,
    );
    if (!user || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const accessToken = await this.tokenService.signAccessToken(user.id);
    const refreshToken = await this.tokenService.issueRefreshToken(user.id);

    return { accessToken, refreshToken, user };
  }

  async refresh(refreshToken: string) {
    const userId = await this.tokenService.consumeRefreshToken(refreshToken);
    if (!userId) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const accessToken = await this.tokenService.signAccessToken(user.id);
    const newRefreshToken = await this.tokenService.issueRefreshToken(user.id);

    return { accessToken, refreshToken: newRefreshToken, user };
  }

  async logout(refreshToken: string) {
    await this.tokenService.revokeRefreshToken(refreshToken);
    return true;
  }
}