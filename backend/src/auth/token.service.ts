import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class TokenService {
  constructor(
    private jwt: JwtService,
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  signAccessToken(userId: string) {
    return this.jwt.signAsync({ sub: userId });
  }

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  async issueRefreshToken(userId: string) {
    const token = randomBytes(32).toString('hex');
    const days = Number(this.config.get('REFRESH_TOKEN_TTL_DAYS') ?? 7);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hash(token),
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      },
    });

    return token;
  }

  // Token valid ho to delete karke userId return karta hai (rotation ke liye)
  async consumeRefreshToken(token: string): Promise<string | null> {
    const tokenHash = this.hash(token);

    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (!row) return null;

    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { tokenHash },
    });
    if (count === 0 || row.expiresAt < new Date()) return null;

    return row.userId;
  }

  async getRefreshTokenUserId(
    token: string,
  ): Promise<string | null> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hash(token) },
    });

    if (!row || row.expiresAt <= new Date()) {
      return null;
    }

    return row.userId;
  }

  async rotateRefreshToken(
    token: string,
  ): Promise<{ userId: string; refreshToken: string } | null> {
    const tokenHash = this.hash(token);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.refreshToken.findUnique({
        where: { tokenHash },
      });

      if (!row || row.expiresAt <= now) {
        return null;
      }

      // Conditional deletion ensures the same token cannot be
      // successfully consumed by two concurrent transactions.
      const { count } = await tx.refreshToken.deleteMany({
        where: {
          tokenHash,
          expiresAt: { gt: now },
        },
      });

      if (count !== 1) {
        return null;
      }

      const newToken = randomBytes(32).toString('hex');
      const days = Number(
        this.config.get('REFRESH_TOKEN_TTL_DAYS') ?? 7,
      );

      // If creation fails, the transaction rolls back the deletion.
      await tx.refreshToken.create({
        data: {
          userId: row.userId,
          tokenHash: this.hash(newToken),
          expiresAt: new Date(
            Date.now() + days * 24 * 60 * 60 * 1000,
          ),
        },
      });

      return {
        userId: row.userId,
        refreshToken: newToken,
      };
    });
  }

  async revokeRefreshToken(token: string) {
    await this.prisma.refreshToken.deleteMany({
      where: { tokenHash: this.hash(token) },
    });
  }
}