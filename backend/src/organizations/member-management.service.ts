import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { MEMBER_SELECT } from './organizations.service.js';
import { UpdateMemberRoleInput } from './dto/update-member-role.input.js';

const NOT_A_MEMBER = 'You are not a member of this organization';
const LAST_ADMIN = 'An organization must have at least one admin';

@Injectable()
export class MemberManagementService {
  constructor(private prisma: PrismaService) {}

  // Serializable: do ADMIN ek saath last-admin rule tod na sakein
  private async runSerializable<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2034'
      ) {
        throw new ConflictException('Concurrent update detected, please retry');
      }
      throw e;
    }
  }

  private async assertAdmin(
    tx: Prisma.TransactionClient,
    callerId: string,
    organizationId: string,
  ) {
    const caller = await tx.organizationMember.findUnique({
      where: { userId_organizationId: { userId: callerId, organizationId } },
      select: { role: true },
    });
    if (!caller) {
      throw new ForbiddenException(NOT_A_MEMBER);
    }
    if (caller.role !== Role.ADMIN) {
      throw new ForbiddenException('Insufficient role');
    }
  }

  private async assertNotLastAdmin(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ) {
    const admins = await tx.organizationMember.count({
      where: { organizationId, role: Role.ADMIN },
    });
    if (admins <= 1) {
      throw new BadRequestException(LAST_ADMIN);
    }
  }

  async updateRole(callerId: string, input: UpdateMemberRoleInput) {
    const { organizationId, userId, role } = input;

    return this.runSerializable(async (tx) => {
      await this.assertAdmin(tx, callerId, organizationId);

      // organizationId se scoped: doosri org ka member yahan nahi milega
      const target = await tx.organizationMember.findUnique({
        where: { userId_organizationId: { userId, organizationId } },
        select: { role: true },
      });
      if (!target) {
        throw new NotFoundException('Member not found');
      }

      if (target.role === Role.ADMIN && role !== Role.ADMIN) {
        await this.assertNotLastAdmin(tx, organizationId);
      }

      return tx.organizationMember.update({
        where: { userId_organizationId: { userId, organizationId } },
        data: { role },
        select: MEMBER_SELECT,
      });
    });
  }

  async removeMember(callerId: string, organizationId: string, userId: string) {
    return this.runSerializable(async (tx) => {
      await this.assertAdmin(tx, callerId, organizationId);

      const target = await tx.organizationMember.findUnique({
        where: { userId_organizationId: { userId, organizationId } },
        select: { role: true },
      });
      if (!target) {
        throw new NotFoundException('Member not found');
      }

      if (target.role === Role.ADMIN) {
        await this.assertNotLastAdmin(tx, organizationId);
      }

      // Sirf membership delete. User account aur uske refresh tokens wahi rehte hain.
      await tx.organizationMember.delete({
        where: { userId_organizationId: { userId, organizationId } },
      });
      return true;
    });
  }
}
