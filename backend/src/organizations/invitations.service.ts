import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '@prisma/client';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { InviteMemberInput } from './dto/invite-member.input.js';

const NOT_A_MEMBER = 'You are not a member of this organization';
const INVALID_INVITE = 'Invalid or expired invitation';
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };

    return entities[character];
  });
}

@Injectable()
export class InvitationsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private emailService: EmailService,
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

    if (caller.role !== Role.ADMIN) {
      throw new ForbiddenException('Only organization admins can invite members');
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

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });

    if (!organization) {
      throw new BadRequestException('Organization not found');
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    const invitation = await this.prisma.organizationInvitation.create({
      data: {
        organizationId,
        email,
        role,
        tokenHash: hashToken(token),
        invitedById: callerId,
        expiresAt,
      },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
      },
    });

    const configuredFrontendUrl =
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';

    const frontendUrl = configuredFrontendUrl.replace(/\/+$/, '');
    const acceptUrl =
      `${frontendUrl}/accept-invitation?token=${encodeURIComponent(token)}`;

    const organizationName = organization.name;
    const safeOrganizationName = escapeHtml(organizationName);
    const safeRole = escapeHtml(String(role));
    const safeAcceptUrl = escapeHtml(acceptUrl);

    const subject = `You're invited to join ${organizationName} on TaskForge`;

    const text = [
      `You've been invited to join ${organizationName} on TaskForge.`,
      '',
      `Assigned role: ${role}`,
      '',
      'Accept your invitation using this link:',
      acceptUrl,
      '',
      'This invitation expires in 7 days.',
      'Sign in using the email address that received this invitation.',
      '',
      "If you weren't expecting this invitation, you can ignore this email.",
    ].join('\n');

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TaskForge Invitation</title>
</head>
<body style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#172033;">
  <div style="max-width:600px;margin:0 auto;padding:36px 16px;">
    <div style="background:#ffffff;border:1px solid #e5eaf2;border-radius:16px;overflow:hidden;">
      <div style="padding:28px 32px;background:#172554;color:#ffffff;">
        <div style="font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#bfdbfe;">TASKFORGE</div>
        <h1 style="margin:16px 0 0;font-size:27px;line-height:1.3;">You're invited!</h1>
      </div>

      <div style="padding:32px;">
        <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">You've been invited to join <strong>${safeOrganizationName}</strong> on TaskForge.</p>

        <div style="margin:24px 0;padding:18px 20px;background:#f8fafc;border:1px solid #e5eaf2;border-radius:10px;">
          <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Your assigned role</div>
          <div style="margin-top:7px;font-size:16px;font-weight:700;color:#172554;">${safeRole}</div>
        </div>

        <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#475569;">Accept the invitation below to get started. You'll need to sign in using the email address that received this message.</p>

        <div style="text-align:center;margin:30px 0;">
          <a href="${safeAcceptUrl}" style="display:inline-block;padding:15px 28px;background:#2563eb;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;border-radius:9px;">Accept Invitation</a>
        </div>

        <p style="margin:24px 0 8px;font-size:13px;line-height:1.6;color:#64748b;">This invitation expires in 7 days. If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="margin:0;font-size:12px;line-height:1.7;word-break:break-all;"><a href="${safeAcceptUrl}" style="color:#2563eb;">${safeAcceptUrl}</a></p>

        <hr style="margin:28px 0;border:0;border-top:1px solid #e5eaf2;">

        <p style="margin:0;font-size:12px;line-height:1.7;color:#64748b;">If you weren't expecting this invitation, you can safely ignore this email.</p>
      </div>
    </div>

    <p style="margin:18px 0 0;text-align:center;font-size:12px;color:#94a3b8;">TaskForge · Work better, together.</p>
  </div>
</body>
</html>`.trim();

    try {
      await this.emailService.send({
        to: email,
        subject,
        text,
        html,
      });
    } catch (error) {
      // Email delivery fail hone par unusable pending invitation clean up karo.
      try {
        await this.prisma.organizationInvitation.deleteMany({
          where: {
            id: invitation.id,
            acceptedAt: null,
          },
        });
      } catch {
        // Original email error ko preserve karo.
      }

      throw error;
    }

    const isProduction = this.config.get<string>('NODE_ENV') === 'production';

    return {
      ...invitation,
      inviteToken: isProduction ? null : token,
    };
  }

  async acceptInvitation(userId: string, token: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user) {
      throw new BadRequestException(INVALID_INVITE);
    }

    return this.prisma.$transaction((tx) =>
      this.acceptInvitationInTransaction(
        tx,
        userId,
        user.email,
        token,
      ),
    );
  }

  async acceptInvitationInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    email: string,
    token: string,
  ) {
    const invitation = await tx.organizationInvitation.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        organizationId: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
      },
    });

    const now = new Date();

    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.expiresAt <= now ||
      invitation.email !== email.trim().toLowerCase()
    ) {
      throw new BadRequestException(INVALID_INVITE);
    }

    // Atomically claim the invitation to prevent concurrent acceptance.
    const claimed = await tx.organizationInvitation.updateMany({
      where: {
        id: invitation.id,
        acceptedAt: null,
        expiresAt: { gt: now },
      },
      data: { acceptedAt: now },
    });

    if (claimed.count === 0) {
      throw new BadRequestException(INVALID_INVITE);
    }

    try {
      await tx.organizationMember.create({
        data: {
          userId,
          organizationId: invitation.organizationId,
          role: invitation.role,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'You are already a member of this organization',
        );
      }

      throw error;
    }

    return tx.organization.findUniqueOrThrow({
      where: { id: invitation.organizationId },
    });
  }
}
