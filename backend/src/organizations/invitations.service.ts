import { createHash, randomBytes } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { InviteMemberInput } from './dto/invite-member.input.js';

const NOT_A_MEMBER = 'You are not a member of this organization';
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 din

// Token high-entropy random hai, isliye fast SHA-256 kaafi hai (bcrypt nahi chahiye)
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class InvitationsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async inviteMember(callerId: string, input: InviteMemberInput) {
    const { organizationId, role } = input;
    const email = input.email.trim().toLowerCase();

    const caller = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId: callerId, organizationId } },
      select: { role: true },
    });

    if (!caller) {
      throw new ForbiddenException(NOT_A_MEMBER);
    }
    if (caller.role === Role.EMPLOYEE) {
      throw new ForbiddenException('Insufficient role');
    }
    if (caller.role === Role.MANAGER && role !== Role.EMPLOYEE) {
      throw new ForbiddenException('Managers can only invite employees');
    }

    const existingMember = await this.prisma.organizationMember.findFirst({
      where: {
        organizationId,
        user: { email: { equals: email, mode: 'insensitive' } },
      },
      select: { id: true },
    });
    if (existingMember) {
      throw new ConflictException('This user is already a member');
    }

    const pending = await this.prisma.organizationInvitation.findFirst({
      where: {
        organizationId,
        email,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (pending) {
      throw new ConflictException(
        'An active invitation already exists for this email',
      );
    }

    const token = randomBytes(32).toString('hex');

    const invitation = await this.prisma.organizationInvitation.create({
      data: {
        organizationId,
        email,
        role,
        tokenHash: hashToken(token),
        invitedById: callerId,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
      select: { id: true, email: true, role: true, expiresAt: true },
    });

    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    return { ...invitation, inviteToken: isProduction ? null : token };
  }
}
