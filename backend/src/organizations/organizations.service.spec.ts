import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('OrganizationsService', () => {
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

  const orgA = { id: 'o1', name: 'Org A', slug: 'org-a' };
  const orgB = { id: 'o2', name: 'Org B', slug: 'org-b' };

  it('returns only organizations the user belongs to', async () => {
    findMany.mockResolvedValue([
      { organization: orgA },
      { organization: orgB },
    ]);

    const result = await service.findAllForUser('u1');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
    expect(result).toEqual([orgA, orgB]);
  });

  it('returns an empty list when the user has no memberships', async () => {
    findMany.mockResolvedValue([]);
    await expect(service.findAllForUser('u1')).resolves.toEqual([]);
  });

  it('lets an ADMIN member read the organization', async () => {
    findUnique.mockResolvedValue({ role: 'ADMIN', organization: orgA });
    await expect(service.findOneForMember('u1', 'o1')).resolves.toEqual(orgA);
  });

  it('lets an EMPLOYEE member read their own organization', async () => {
    findUnique.mockResolvedValue({ role: 'EMPLOYEE', organization: orgA });
    await expect(service.findOneForMember('u1', 'o1')).resolves.toEqual(orgA);
  });

  it('rejects a non-member (cross-tenant access)', async () => {
    findUnique.mockResolvedValue(null);
    await expect(service.findOneForMember('u1', 'o2')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('scopes the lookup by both userId and organizationId', async () => {
    findUnique.mockResolvedValue({ role: 'ADMIN', organization: orgA });

    await service.findOneForMember('u1', 'o1');

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_organizationId: { userId: 'u1', organizationId: 'o1' },
        },
      }),
    );
  });
});
