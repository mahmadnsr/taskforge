import { Prisma, Role } from '@prisma/client';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { generateSlug } from '../common/utils/slug.util.js';
import { PrismaService } from '../prisma/prisma.service.js';

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
      throw new ForbiddenException('You are not a member of this organization');
    }
    return membership.organization;
  }
}