import { Prisma, Role } from '@prisma/client';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { generateSlug } from '../common/utils/slug.util.js';
import { PrismaService } from '../prisma/prisma.service.js';

const NOT_A_MEMBER = 'You are not a member of this organization';

// Sirf wahi fields jo client ko dikhane hain. passwordHash kabhi select nahi hota.
const MEMBER_SELECT = {
  id: true,
  role: true,
  user: {
    select: { id: true, name: true, email: true, createdAt: true },
  },
} satisfies Prisma.OrganizationMemberSelect;

@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService) {}

  createWithAdmin(
    tx: Prisma.TransactionClient,
    name: string,
    adminUserId: string,
  ) {
    return tx.organization.create({
      data: {
        name,
        slug: generateSlug(name),
        members: {
          create: { userId: adminUserId, role: Role.ADMIN },
        },
      },
    });
  }

  async findAllForUser(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => m.organization);
  }

  async findOneForMember(userId: string, organizationId: string) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      include: { organization: true },
    });

    // Non-member aur nonexistent org ka same error (existence leak nahi)
    if (!membership) {
      throw new ForbiddenException(NOT_A_MEMBER);
    }
    return membership.organization;
  }

  // Day 2: caller ka us organization ka member hona zaroori hai
  private async assertMember(userId: string, organizationId: string) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
    if (!membership) {
      throw new ForbiddenException(NOT_A_MEMBER);
    }
    return membership;
  }

  async listMembers(userId: string, organizationId: string) {
    await this.assertMember(userId, organizationId);

    return this.prisma.organizationMember.findMany({
      where: { organizationId },
      select: MEMBER_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  async getMember(
    userId: string,
    organizationId: string,
    targetUserId: string,
  ) {
    await this.assertMember(userId, organizationId);

    // Lookup organizationId se scoped hai: doosri org ka member yahan mil hi nahi sakta
    const member = await this.prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: { userId: targetUserId, organizationId },
      },
      select: MEMBER_SELECT,
    });
    if (!member) {
      throw new NotFoundException('Member not found');
    }
    return member;
  }
}