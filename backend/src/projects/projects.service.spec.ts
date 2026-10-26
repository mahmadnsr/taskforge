import { describe, it, expect, vi } from 'vitest';
import {
  BadRequestException,
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
  const prisma = {
    organizationMember: {
      findFirst: vi.fn().mockResolvedValue(role ? { role } : null),
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
      ).rejects.toThrow('Insufficient role');
    });

    it('MANAGER creates with createdById from caller and trimmed name', async () => {
      const { service, prisma } = setup(Role.MANAGER);
      await service.create(USER, { organizationId: ORG, name: '  Alpha  ' });
      expect(prisma.project.create).toHaveBeenCalledWith({
        data: {
          organizationId: ORG,
          name: 'Alpha',
          description: null,
          createdById: USER,
        },
      });
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

    it('EMPLOYEE can list; archived excluded by default', async () => {
      const { service, prisma } = setup(Role.EMPLOYEE);
      await service.list(USER, ORG);
      expect(prisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: ORG, status: ProjectStatus.ACTIVE },
        }),
      );
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
    it('returns cached projects without querying the database', async () => {
      const { service, prisma, cache } = setup(Role.EMPLOYEE);
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
      const { service, cache } = setup(Role.MANAGER);

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

    it('returns project for member', async () => {
      const { service, prisma } = setup(Role.EMPLOYEE);
      prisma.project.findFirst.mockResolvedValue(active);
      await expect(service.get(USER, ORG, PID)).resolves.toEqual(active);
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

    it('updates only provided fields, scoped by id+organizationId', async () => {
      const { service, prisma } = setup(Role.MANAGER);
      prisma.project.findFirst.mockResolvedValue(active);
      await service.update(USER, {
        organizationId: ORG,
        projectId: PID,
        name: ' New ',
      });
      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id_organizationId: { id: PID, organizationId: ORG } },
        data: { name: 'New' },
      });
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
});
