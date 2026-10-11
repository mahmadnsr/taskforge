import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('OrganizationsService: members', () => {
  const findMany = vi.fn();
  const findUnique = vi.fn();
  const prisma = {
    organizationMember: { findMany, findUnique },
  } as unknown as PrismaService;

  let service: OrganizationsService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new OrganizationsService(prisma);
  });

  const member1 = {
    id: 'm1',
    role: 'ADMIN',
    user: { id: 'u1', name: 'One', email: 'one@test.com', createdAt: new Date() },
  };
  const member2 = {
    id: 'm2',
    role: 'EMPLOYEE',
    user: { id: 'u2', name: 'Two', email: 'two@test.com', createdAt: new Date() },
  };

  it('returns the member list for a member of the organization', async () => {
    findUnique.mockResolvedValue({ role: 'EMPLOYEE' }); // caller membership
    findMany.mockResolvedValue([member1, member2]);

    const result = await service.listMembers('u2', 'org-1');

    expect(result).toEqual([member1, member2]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-1' } }),
    );
  });

  it('rejects a non-member and never queries the member list', async () => {
    findUnique.mockResolvedValue(null);

    await expect(service.listMembers('u9', 'org-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(findMany).not.toHaveBeenCalled();
  });

  it('blocks cross-org access: member of org A cannot list org B', async () => {
    // Caller org B ka member nahi hai
    findUnique.mockResolvedValue(null);

    await expect(service.listMembers('u1', 'org-B')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(findUnique).toHaveBeenCalledWith({
      where: { userId_organizationId: { userId: 'u1', organizationId: 'org-B' } },
    });
  });

  it('never selects passwordHash or refresh tokens', async () => {
    findUnique.mockResolvedValue({ role: 'ADMIN' });
    findMany.mockResolvedValue([member1]);

    await service.listMembers('u1', 'org-1');

    const args = JSON.stringify(findMany.mock.calls[0][0]);
    expect(args).not.toContain('passwordHash');
    expect(args).not.toContain('refreshTokens');
  });

  it('returns an empty list when the organization has no members', async () => {
    findUnique.mockResolvedValue({ role: 'ADMIN' });
    findMany.mockResolvedValue([]);

    await expect(service.listMembers('u1', 'org-1')).resolves.toEqual([]);
  });

  it('returns one member scoped to the organization', async () => {
    findUnique
      .mockResolvedValueOnce({ role: 'ADMIN' }) // caller
      .mockResolvedValueOnce(member2); // target

    const result = await service.getMember('u1', 'org-1', 'u2');

    expect(result).toEqual(member2);
    expect(findUnique).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { userId_organizationId: { userId: 'u2', organizationId: 'org-1' } },
      }),
    );
  });

  it('rejects member details for a non-member caller', async () => {
    findUnique.mockResolvedValue(null);

    await expect(service.getMember('u9', 'org-1', 'u2')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('throws NotFound when the target is not in this organization', async () => {
    findUnique
      .mockResolvedValueOnce({ role: 'ADMIN' }) // caller ok
      .mockResolvedValueOnce(null); // target nahi mila

    await expect(service.getMember('u1', 'org-1', 'ghost')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});