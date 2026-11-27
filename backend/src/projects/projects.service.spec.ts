import { describe, it, expect, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ProjectStatus, Role } from '@prisma/client';
import { ProjectsService } from './projects.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { CacheService } from '../cache/cache.service.js';

const ORG = 'org-1';
const USER = 'user-1';
const PID = 'proj-1';

function setup(role: Role | null) {
  const tx = {
    task: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    projectMember: { delete: vi.fn().mockResolvedValue({ id: 'pm-1' }) },
  };
  const prisma = {
    organizationMember: {
      findFirst: vi.fn().mockResolvedValue(role ? { role } : null),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    projectMember: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(async ({ data }) => ({
        id: 'pm-1',
        ...data,
        orgMember: { user: { id: data.userId, name: 'User' } },
      })),
      delete: vi.fn().mockResolvedValue({ id: 'pm-1' }),
    },
    project: {
      create: vi
        .fn()
        .mockImplementation(async ({ data }) => ({ id: PID, ...data })),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      update: vi
        .fn()
        .mockImplementation(async ({ data }) => ({ id: PID, ...data })),
    },
    task: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn().mockResolvedValue(0),
    },
    $transaction: vi.fn().mockImplementation(async (cb) => cb(tx)),
  };
  const cache = {
    getOrganizationVersion: vi.fn().mockResolvedValue(0),
    incrementOrganizationVersion: vi.fn().mockResolvedValue(undefined),
    getJson: vi.fn().mockResolvedValue(null),
    setJson: vi.fn().mockResolvedValue(undefined),
  };
  const service = new ProjectsService(
    prisma as unknown as PrismaService,
    cache as unknown as CacheService,
  );
  return { prisma, cache, service };
}

const active = { id: PID, organizationId: ORG, status: ProjectStatus.ACTIVE };

describe('ProjectsService', () => {
  describe('create', () => {
    it('rejects non-member', async () => {
      const { service, prisma } = setup(null);
      await expect(
        service.create(USER, { organizationId: ORG, name: 'A' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.project.create).not.toHaveBeenCalled();
    });

    it('rejects EMPLOYEE', async () => {
      const { service } = setup(Role.EMPLOYEE);
      await expect(
        service.create(USER, { organizationId: ORG, name: 'A' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects MANAGER because only ADMIN can create projects', async () => {
      const { service, prisma } = setup(Role.MANAGER);
      await expect(
        service.create(USER, { organizationId: ORG, name: 'A' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.project.create).not.toHaveBeenCalled();
    });



    it('rejects blank name', async () => {
      const { service } = setup(Role.ADMIN);
      await expect(
        service.create(USER, { organizationId: ORG, name: '   ' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('list', () => {
    it('rejects non-member', async () => {
      const { service } = setup(null);
      await expect(service.list(USER, ORG)).rejects.toThrow(ForbiddenException);
    });

    it('EMPLOYEE list is filtered to assigned active projects', async () => {
      const { service, prisma, cache } = setup(Role.EMPLOYEE);
      await service.list(USER, ORG);
      expect(prisma.project.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: ORG,
          status: ProjectStatus.ACTIVE,
          members: { some: { userId: USER, organizationId: ORG } },
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(cache.getOrganizationVersion).not.toHaveBeenCalled();
      expect(cache.getJson).not.toHaveBeenCalled();
    });

    it('MANAGER list is filtered to assigned projects', async () => {
      const { service, prisma } = setup(Role.MANAGER);
      await service.list(USER, ORG);
      expect(prisma.project.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: ORG,
          status: ProjectStatus.ACTIVE,
          members: { some: { userId: USER, organizationId: ORG } },
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('includeArchived removes status filter but keeps org scope', async () => {
      const { service, prisma } = setup(Role.ADMIN);
      await service.list(USER, ORG, true);
      expect(prisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: ORG } }),
      );
    });
  });

  describe('Redis project-list caching', () => {
    it('does not use the organization-wide cache for EMPLOYEE lists', async () => {
      const { service, prisma, cache } = setup(Role.EMPLOYEE);
      await service.list(USER, ORG);

      expect(cache.getOrganizationVersion).not.toHaveBeenCalled();
      expect(cache.getJson).not.toHaveBeenCalled();
      expect(prisma.project.findMany).toHaveBeenCalledOnce();
    });

    it('ADMIN can use the organization-wide project cache', async () => {
      const { service, prisma, cache } = setup(Role.ADMIN);
      const cachedProjects = [{ ...active, name: 'Cached project' }];
      cache.getJson.mockResolvedValue(cachedProjects);

      await expect(service.list(USER, ORG)).resolves.toEqual(cachedProjects);

      expect(cache.getJson).toHaveBeenCalledWith(
        `taskforge:projects:v1:org:${ORG}:version:0:archived:false`,
      );
      expect(prisma.project.findMany).not.toHaveBeenCalled();
    });

    it('queries the database on a cache miss and caches the result', async () => {
      const { service, prisma, cache } = setup(Role.ADMIN);
      prisma.project.findMany.mockResolvedValue([active] as never);

      await expect(service.list(USER, ORG)).resolves.toEqual([active]);

      expect(prisma.project.findMany).toHaveBeenCalledOnce();
      expect(cache.setJson).toHaveBeenCalledWith(
        `taskforge:projects:v1:org:${ORG}:version:0:archived:false`,
        [active],
        30,
      );
    });

    it('uses a distinct cache key when archived projects are included', async () => {
      const { service, cache } = setup(Role.ADMIN);

      await service.list(USER, ORG, true);

      expect(cache.getJson).toHaveBeenCalledWith(
        `taskforge:projects:v1:org:${ORG}:version:0:archived:true`,
      );
    });

    it('falls back to the database when Redis version lookup is unavailable', async () => {
      const { service, prisma, cache } = setup(Role.ADMIN);
      cache.getOrganizationVersion.mockResolvedValue(null);
      prisma.project.findMany.mockResolvedValue([active] as never);

      await expect(service.list(USER, ORG)).resolves.toEqual([active]);

      expect(prisma.project.findMany).toHaveBeenCalledOnce();
      expect(cache.getJson).not.toHaveBeenCalled();
      expect(cache.setJson).not.toHaveBeenCalled();
    });

    it('checks organization membership before accessing the cache', async () => {
      const { service, cache } = setup(null);

      await expect(service.list(USER, ORG)).rejects.toThrow(
        ForbiddenException,
      );

      expect(cache.getOrganizationVersion).not.toHaveBeenCalled();
      expect(cache.getJson).not.toHaveBeenCalled();
    });
  });

  describe('cache invalidation', () => {
    it('invalidates the organization cache after project creation', async () => {
      const { service, cache } = setup(Role.ADMIN);

      await service.create(USER, { organizationId: ORG, name: 'Alpha' });

      expect(cache.incrementOrganizationVersion).toHaveBeenCalledWith(ORG);
    });

    it('invalidates the organization cache after project update', async () => {
      const { service, prisma, cache } = setup(Role.ADMIN);
      prisma.project.findFirst.mockResolvedValue(active);

      await service.update(USER, {
        organizationId: ORG,
        projectId: PID,
        name: 'Renamed',
      });

      expect(cache.incrementOrganizationVersion).toHaveBeenCalledWith(ORG);
    });
  });

  describe('get', () => {
    it('rejects non-member', async () => {
      const { service } = setup(null);
      await expect(service.get(USER, ORG, PID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('NotFound when project is not in this org (cross-tenant)', async () => {
      const { service, prisma } = setup(Role.ADMIN);
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(service.get(USER, ORG, PID)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.project.findFirst).toHaveBeenCalledWith({
        where: { id: PID, organizationId: ORG },
      });
    });

    it('returns project for ADMIN without project membership', async () => {
      const { service, prisma } = setup(Role.ADMIN);
      prisma.project.findFirst.mockResolvedValue(active);
      await expect(service.get(USER, ORG, PID)).resolves.toEqual(active);
      expect(prisma.projectMember.findFirst).not.toHaveBeenCalled();
    });

    it('rejects EMPLOYEE without project membership', async () => {
      const { service, prisma } = setup(Role.EMPLOYEE);
      prisma.project.findFirst.mockResolvedValue(active);
      await expect(service.get(USER, ORG, PID)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('rejects EMPLOYEE', async () => {
      const { service } = setup(Role.EMPLOYEE);
      await expect(
        service.update(USER, {
          organizationId: ORG,
          projectId: PID,
          name: 'X',
        }),
      ).rejects.toThrow('Insufficient role');
    });

    it('rejects empty update', async () => {
      const { service } = setup(Role.ADMIN);
      await expect(
        service.update(USER, { organizationId: ORG, projectId: PID }),
      ).rejects.toThrow('Nothing to update');
    });

    it('cross-tenant project -> NotFound and no update', async () => {
      const { service, prisma } = setup(Role.ADMIN);
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(
        service.update(USER, {
          organizationId: ORG,
          projectId: PID,
          name: 'X',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.project.update).not.toHaveBeenCalled();
    });

    it('rejects update on archived project', async () => {
      const { service, prisma } = setup(Role.ADMIN);
      prisma.project.findFirst.mockResolvedValue({
        ...active,
        status: ProjectStatus.ARCHIVED,
      });
      await expect(
        service.update(USER, {
          organizationId: ORG,
          projectId: PID,
          name: 'X',
        }),
      ).rejects.toThrow('Archived projects cannot be updated');
    });

    it('MANAGER cannot update a project without project membership', async () => {
      const { service, prisma } = setup(Role.MANAGER);
      prisma.project.findFirst.mockResolvedValue(active);

      await expect(service.update(USER, {
        organizationId: ORG,
        projectId: PID,
        name: ' New ',
      })).rejects.toThrow(ForbiddenException);

      expect(prisma.project.update).not.toHaveBeenCalled();
    });
  });

  describe('archive', () => {
    it('rejects EMPLOYEE', async () => {
      const { service } = setup(Role.EMPLOYEE);
      await expect(service.archive(USER, ORG, PID)).rejects.toThrow(
        'Insufficient role',
      );
    });

    it('NotFound for cross-tenant project', async () => {
      const { service, prisma } = setup(Role.ADMIN);
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(service.archive(USER, ORG, PID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('sets status ARCHIVED (soft delete, no hard delete)', async () => {
      const { service, prisma } = setup(Role.ADMIN);
      prisma.project.findFirst.mockResolvedValue(active);
      await service.archive(USER, ORG, PID);
      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id_organizationId: { id: PID, organizationId: ORG } },
        data: { status: ProjectStatus.ARCHIVED },
      });
    });

    it('invalidates the organization cache after archiving a project', async () => {
      const { service, prisma, cache } = setup(Role.ADMIN);
      prisma.project.findFirst.mockResolvedValue(active);

      await service.archive(USER, ORG, PID);

      expect(cache.incrementOrganizationVersion).toHaveBeenCalledWith(ORG);
    });

    it('already archived is idempotent, no second update', async () => {
      const { service, prisma } = setup(Role.ADMIN);
      prisma.project.findFirst.mockResolvedValue({
        ...active,
        status: ProjectStatus.ARCHIVED,
      });
      await service.archive(USER, ORG, PID);
      expect(prisma.project.update).not.toHaveBeenCalled();
    });
  });

  describe('project membership management', () => {
    it('EMPLOYEE cannot add project members', async () => {
      const { service, prisma } = setup(Role.EMPLOYEE);
      await expect(
        service.addMember(USER, ORG, PID, 'u-target'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.projectMember.create).not.toHaveBeenCalled();
    });

    it('MANAGER cannot manage another project team', async () => {
      const { service, prisma } = setup(Role.MANAGER);
      prisma.project.findFirst.mockResolvedValue(active);
      await expect(service.addMember(USER, ORG, PID, 'u-target')).rejects.toThrow(ForbiddenException);
      await expect(service.removeMember(USER, ORG, PID, 'u-target')).rejects.toThrow(ForbiddenException);
      expect(prisma.projectMember.create).not.toHaveBeenCalled();
      expect(prisma.projectMember.delete).not.toHaveBeenCalled();
    });

    it('rejects adding member if project is archived', async () => {
      const { service, prisma } = setup(Role.ADMIN);
      prisma.project.findFirst.mockResolvedValue({
        ...active,
        status: ProjectStatus.ARCHIVED,
      });

      await expect(
        service.addMember(USER, ORG, PID, 'u-target'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects adding member if user is not in organization', async () => {
      const { service, prisma } = setup(Role.ADMIN);
      prisma.project.findFirst.mockResolvedValue(active);
      prisma.organizationMember.findUnique.mockResolvedValue(null);

      await expect(
        service.addMember(USER, ORG, PID, 'u-target'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects adding member if user is already a project member', async () => {
      const { service, prisma } = setup(Role.ADMIN);
      prisma.project.findFirst.mockResolvedValue(active);
      prisma.organizationMember.findUnique.mockResolvedValue({
        userId: 'u-target',
        organizationId: ORG,
        user: { id: 'u-target', name: 'Target' },
      });
      prisma.projectMember.findUnique.mockResolvedValue({
        id: 'pm-1',
        projectId: PID,
        userId: 'u-target',
      });

      await expect(
        service.addMember(USER, ORG, PID, 'u-target'),
      ).rejects.toThrow(ConflictException);
    });

    it('successfully adds member to project', async () => {
      const { service, prisma } = setup(Role.ADMIN);
      prisma.project.findFirst.mockResolvedValue(active);
      prisma.organizationMember.findUnique.mockResolvedValue({
        userId: 'u-target',
        organizationId: ORG,
        user: { id: 'u-target', name: 'Target' },
      });
      prisma.projectMember.findUnique.mockResolvedValue(null);

      const result = await service.addMember(USER, ORG, PID, 'u-target');
      expect(result.userId).toBe('u-target');
      expect(prisma.projectMember.create).toHaveBeenCalledWith({
        data: {
          projectId: PID,
          userId: 'u-target',
          organizationId: ORG,
        },
        include: {
          orgMember: {
            include: {
              user: true,
            },
          },
        },
      });
    });

    it('MANAGER adds an existing organization EMPLOYEE to an authorized project', async () => {
      const { service, prisma } = setup(Role.MANAGER);
      prisma.project.findFirst.mockResolvedValue(active);
      prisma.projectMember.findFirst.mockResolvedValue({ id: 'caller-membership' });
      prisma.organizationMember.findUnique.mockResolvedValue({ role: Role.EMPLOYEE, user: { id: 'u-target' } });

      await expect(service.addMember(USER, ORG, PID, 'u-target')).resolves.toMatchObject({ userId: 'u-target' });
      expect(prisma.projectMember.create).toHaveBeenCalledOnce();
    });

    it.each([Role.ADMIN, Role.MANAGER])('MANAGER cannot add a %s to a project team', async (targetRole) => {
      const { service, prisma } = setup(Role.MANAGER);
      prisma.project.findFirst.mockResolvedValue(active);
      prisma.projectMember.findFirst.mockResolvedValue({ id: 'caller-membership' });
      prisma.organizationMember.findUnique.mockResolvedValue({ role: targetRole, user: { id: 'u-target' } });

      await expect(service.addMember(USER, ORG, PID, 'u-target')).rejects.toThrow(ForbiddenException);
      expect(prisma.projectMember.create).not.toHaveBeenCalled();
    });

    it('only ADMIN can remove project members', async () => {
      const { service } = setup(Role.EMPLOYEE);
      await expect(
        service.removeMember(USER, ORG, PID, 'u-target'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('removes an unassigned project member without changing task ownership', async () => {
      const { service, prisma } = setup(Role.ADMIN);
      prisma.project.findFirst.mockResolvedValue(active);
      prisma.projectMember.findUnique.mockResolvedValue({
        id: 'pm-1',
        projectId: PID,
        userId: 'u-target',
      });

      const result = await service.removeMember(USER, ORG, PID, 'u-target');
      expect(result).toBe(true);
      expect(prisma.task.count).toHaveBeenCalledWith({ where: { projectId: PID, organizationId: ORG, assigneeId: 'u-target' } });
      expect(prisma.projectMember.delete).toHaveBeenCalledOnce();
      expect(prisma.task.updateMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects removal while any tasks still belong to the project member', async () => {
      const { service, prisma } = setup(Role.ADMIN);
      prisma.project.findFirst.mockResolvedValue(active);
      prisma.projectMember.findUnique.mockResolvedValue({ id: 'pm-1' });
      prisma.task.count.mockResolvedValue(1);

      await expect(service.removeMember(USER, ORG, PID, 'u-target')).rejects.toThrow('Reassign tasks before removing this project member');
      expect(prisma.projectMember.delete).not.toHaveBeenCalled();
      expect(prisma.task.updateMany).not.toHaveBeenCalled();
    });

    it('MANAGER removes an unassigned EMPLOYEE from an authorized project', async () => {
      const { service, prisma } = setup(Role.MANAGER);
      prisma.project.findFirst.mockResolvedValue(active);
      prisma.projectMember.findFirst.mockResolvedValue({ id: 'caller-membership' });
      prisma.projectMember.findUnique.mockResolvedValue({ id: 'pm-1' });
      prisma.organizationMember.findUnique.mockResolvedValue({ role: Role.EMPLOYEE });

      await expect(service.removeMember(USER, ORG, PID, 'u-target')).resolves.toBe(true);
      expect(prisma.projectMember.delete).toHaveBeenCalledOnce();
    });

    it.each([Role.ADMIN, Role.MANAGER])('MANAGER cannot remove a %s from a project team', async (targetRole) => {
      const { service, prisma } = setup(Role.MANAGER);
      prisma.project.findFirst.mockResolvedValue(active);
      prisma.projectMember.findFirst.mockResolvedValue({ id: 'caller-membership' });
      prisma.projectMember.findUnique.mockResolvedValue({ id: 'pm-1' });
      prisma.organizationMember.findUnique.mockResolvedValue({ role: targetRole });

      await expect(service.removeMember(USER, ORG, PID, 'u-target')).rejects.toThrow(ForbiddenException);
      expect(prisma.projectMember.delete).not.toHaveBeenCalled();
    });

    it('lists project members for authorized caller', async () => {
      const { service, prisma } = setup(Role.ADMIN);
      prisma.project.findFirst.mockResolvedValue(active);
      prisma.projectMember.findMany.mockResolvedValue([
        {
          id: 'pm-1',
          projectId: PID,
          userId: 'u1',
          organizationId: ORG,
          orgMember: { user: { id: 'u1', name: 'Alice' } },
        },
      ]);

      const list = await service.listMembers(USER, ORG, PID);
      expect(list).toHaveLength(1);
      expect(list[0].user).toEqual({ id: 'u1', name: 'Alice' });
    });
  });
});
