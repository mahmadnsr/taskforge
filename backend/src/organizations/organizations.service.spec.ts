import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrganizationsService } from './organizations.service.js';

describe('OrganizationsService', () => {
  let service: OrganizationsService;

  const findMany = vi.fn();
  const findUnique = vi.fn();
  const create = vi.fn();

  const prisma = {
    organizationMember: {
      findMany,
      findUnique,
    },
    organization: {
      create,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OrganizationsService(prisma as any);
  });

  describe('createWithAdmin', () => {
    it('creates an organization with a generated slug and ADMIN membership', async () => {
      const tx = {
        organization: {
          create,
        },
      };

      create.mockResolvedValue({
        id: 'o1',
        name: 'My New Organization',
        slug: 'my-new-organization',
      });

      await service.createWithAdmin(
        tx as any,
        'My New Organization',
        'u1',
      );

      expect(create).toHaveBeenCalledWith({
        data: {
          name: 'My New Organization',
          slug: expect.stringMatching(/^my-new-organization-[a-f0-9]+$/),
          members: {
            create: {
              userId: 'u1',
              role: 'ADMIN',
            },
          },
        },
      });
    });
  });

  describe('findAllForUser', () => {
    it('returns all organizations belonging to the user', async () => {
      const organizations = [
        { id: 'o1', name: 'Organization One' },
        { id: 'o2', name: 'Organization Two' },
      ];

      findMany.mockResolvedValue([
        { organization: organizations[0] },
        { organization: organizations[1] },
      ]);

      const result = await service.findAllForUser('u1');

      expect(result).toEqual(organizations);
      expect(findMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        include: { organization: true },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('returns an empty array when the user has no organizations', async () => {
      findMany.mockResolvedValue([]);

      const result = await service.findAllForUser('u1');

      expect(result).toEqual([]);
    });

    it('propagates database errors', async () => {
      const dbError = new Error('Database unavailable');
      findMany.mockRejectedValue(dbError);

      await expect(service.findAllForUser('u1')).rejects.toBe(dbError);
    });
  });

  describe('findOneForMember', () => {
    it('returns the organization when the user is a member', async () => {
      const organization = {
        id: 'o1',
        name: 'Organization One',
      };

      findUnique.mockResolvedValue({ organization });

      const result = await service.findOneForMember('u1', 'o1');

      expect(result).toEqual(organization);
      expect(findUnique).toHaveBeenCalledWith({
        where: {
          userId_organizationId: {
            userId: 'u1',
            organizationId: 'o1',
          },
        },
        include: { organization: true },
      });
    });

    it('throws ForbiddenException when the user is not a member', async () => {
      findUnique.mockResolvedValue(null);

      await expect(
        service.findOneForMember('u1', 'o1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('listMembers', () => {
    it('returns organization members after verifying membership', async () => {
      const members = [
        {
          id: 'm1',
          role: 'ADMIN',
          user: {
            id: 'u1',
            name: 'Admin',
            email: 'admin@example.com',
            createdAt: new Date('2026-01-01'),
          },
        },
      ];

      findUnique.mockResolvedValue({
        userId: 'u1',
        organizationId: 'o1',
      });
      findMany.mockResolvedValue(members);

      const result = await service.listMembers('u1', 'o1');

      expect(result).toEqual(members);
      expect(findUnique).toHaveBeenCalledWith({
        where: {
          userId_organizationId: {
            userId: 'u1',
            organizationId: 'o1',
          },
        },
      });
      expect(findMany).toHaveBeenCalledWith({
        where: { organizationId: 'o1' },
        select: {
          id: true,
          role: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('throws ForbiddenException when the requester is not a member', async () => {
      findUnique.mockResolvedValue(null);

      await expect(
        service.listMembers('u1', 'o1'),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(findMany).not.toHaveBeenCalled();
    });

    it('returns an empty array when the organization has no members', async () => {
      findUnique.mockResolvedValue({
        userId: 'u1',
        organizationId: 'o1',
      });
      findMany.mockResolvedValue([]);

      const result = await service.listMembers('u1', 'o1');

      expect(result).toEqual([]);
    });
  });

  describe('getMember', () => {
    it('returns the requested member after verifying organization membership', async () => {
      const member = {
        id: 'm2',
        role: 'EMPLOYEE',
        user: {
          id: 'u2',
          name: 'Employee',
          email: 'employee@example.com',
          createdAt: new Date('2026-01-02'),
        },
      };

      findUnique
        .mockResolvedValueOnce({
          userId: 'u1',
          organizationId: 'o1',
        })
        .mockResolvedValueOnce(member);

      const result = await service.getMember('u1', 'o1', 'u2');

      expect(result).toEqual(member);
      expect(findUnique).toHaveBeenNthCalledWith(2, {
        where: {
          userId_organizationId: {
            userId: 'u2',
            organizationId: 'o1',
          },
        },
        select: {
          id: true,
          role: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              createdAt: true,
            },
          },
        },
      });
    });

    it('throws ForbiddenException when the requester is not a member', async () => {
      findUnique.mockResolvedValue(null);

      await expect(
        service.getMember('u1', 'o1', 'u2'),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(findUnique).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException when the target member does not exist', async () => {
      findUnique
        .mockResolvedValueOnce({
          userId: 'u1',
          organizationId: 'o1',
        })
        .mockResolvedValueOnce(null);

      await expect(
        service.getMember('u1', 'o1', 'u2'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('does not expose password hashes or other sensitive fields', async () => {
      findUnique
        .mockResolvedValueOnce({
          userId: 'u1',
          organizationId: 'o1',
        })
        .mockResolvedValueOnce({
          id: 'm2',
          role: 'EMPLOYEE',
          user: {
            id: 'u2',
            name: 'Employee',
            email: 'employee@example.com',
            createdAt: new Date('2026-01-02'),
          },
        });

      const result = await service.getMember('u1', 'o1', 'u2');

      expect(result).not.toHaveProperty('passwordHash');
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.user).not.toHaveProperty('password');
    });
  });
});