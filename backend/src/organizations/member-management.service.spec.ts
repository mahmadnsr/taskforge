import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MemberManagementService } from './member-management.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('MemberManagementService', () => {
  const findUnique = vi.fn();
  const count = vi.fn();
  const update = vi.fn();
  const del = vi.fn();
  const transaction = vi.fn();

  const tx = { organizationMember: { findUnique, count, update, delete: del } };
  const prisma = { $transaction: transaction } as unknown as PrismaService;

  let service: MemberManagementService;

  const roleInput = (role: any, userId = 'u2') => ({
    organizationId: 'o1',
    userId,
    role,
  });

  // findUnique pehli call caller ke liye, doosri target ke liye
  const mockCallerAndTarget = (caller: any, target: any) => {
    findUnique.mockResolvedValueOnce(caller).mockResolvedValueOnce(target);
  };

  beforeEach(() => {
    vi.resetAllMocks();
    transaction.mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx));
    update.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'm1', ...data }),
    );
    del.mockResolvedValue({});
    service = new MemberManagementService(prisma);
  });

  describe('updateRole', () => {
    it('ADMIN can change an EMPLOYEE to MANAGER', async () => {
      mockCallerAndTarget({ role: 'ADMIN' }, { role: 'EMPLOYEE' });
      const res = await service.updateRole('u1', roleInput('MANAGER'));
      expect(res.role).toBe('MANAGER');
      expect(count).not.toHaveBeenCalled();
    });

    it('MANAGER and EMPLOYEE cannot change roles', async () => {
      for (const role of ['MANAGER', 'EMPLOYEE']) {
        findUnique.mockResolvedValueOnce({ role });
        await expect(
          service.updateRole('u1', roleInput('ADMIN')),
        ).rejects.toBeInstanceOf(ForbiddenException);
      }
      expect(update).not.toHaveBeenCalled();
    });

    it('rejects a caller who is not a member (cross-tenant)', async () => {
      findUnique.mockResolvedValueOnce(null);
      await expect(
        service.updateRole('u9', roleInput('ADMIN')),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(update).not.toHaveBeenCalled();
    });

    it('target outside the organization is Not Found, lookup is scoped', async () => {
      mockCallerAndTarget({ role: 'ADMIN' }, null);
      await expect(
        service.updateRole('u1', roleInput('MANAGER', 'stranger')),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(findUnique).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: {
            userId_organizationId: { userId: 'stranger', organizationId: 'o1' },
          },
        }),
      );
    });

    it('blocks demoting the last ADMIN', async () => {
      mockCallerAndTarget({ role: 'ADMIN' }, { role: 'ADMIN' });
      count.mockResolvedValue(1);
      await expect(
        service.updateRole('u1', roleInput('EMPLOYEE', 'u1')),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(update).not.toHaveBeenCalled();
    });

    it('allows demoting an ADMIN when another ADMIN exists', async () => {
      mockCallerAndTarget({ role: 'ADMIN' }, { role: 'ADMIN' });
      count.mockResolvedValue(2);
      const res = await service.updateRole('u1', roleInput('MANAGER'));
      expect(res.role).toBe('MANAGER');
    });

    it('promoting to ADMIN never needs the admin count', async () => {
      mockCallerAndTarget({ role: 'ADMIN' }, { role: 'EMPLOYEE' });
      await service.updateRole('u1', roleInput('ADMIN'));
      expect(count).not.toHaveBeenCalled();
    });

    it('runs in a Serializable transaction', async () => {
      mockCallerAndTarget({ role: 'ADMIN' }, { role: 'EMPLOYEE' });
      await service.updateRole('u1', roleInput('MANAGER'));
      expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    });

    it('turns a serialization failure into a Conflict', async () => {
      transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('conflict', {
          code: 'P2034',
          clientVersion: 'test',
        }),
      );
      await expect(
        service.updateRole('u1', roleInput('MANAGER')),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('removeMember', () => {
    it('ADMIN removes an EMPLOYEE membership only', async () => {
      mockCallerAndTarget({ role: 'ADMIN' }, { role: 'EMPLOYEE' });
      await expect(service.removeMember('u1', 'o1', 'u2')).resolves.toBe(true);
      expect(del).toHaveBeenCalledWith({
        where: {
          userId_organizationId: { userId: 'u2', organizationId: 'o1' },
        },
      });
    });

    it('non-admin cannot remove', async () => {
      findUnique.mockResolvedValueOnce({ role: 'MANAGER' });
      await expect(
        service.removeMember('u1', 'o1', 'u2'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(del).not.toHaveBeenCalled();
    });

    it('blocks removing the last ADMIN (including self)', async () => {
      mockCallerAndTarget({ role: 'ADMIN' }, { role: 'ADMIN' });
      count.mockResolvedValue(1);
      await expect(
        service.removeMember('u1', 'o1', 'u1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(del).not.toHaveBeenCalled();
    });

    it('allows removing an ADMIN when another ADMIN exists', async () => {
      mockCallerAndTarget({ role: 'ADMIN' }, { role: 'ADMIN' });
      count.mockResolvedValue(2);
      await expect(service.removeMember('u1', 'o1', 'u2')).resolves.toBe(true);
    });

    it('target not in this organization is Not Found', async () => {
      mockCallerAndTarget({ role: 'ADMIN' }, null);
      await expect(
        service.removeMember('u1', 'o1', 'ghost'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(del).not.toHaveBeenCalled();
    });
  });
});
