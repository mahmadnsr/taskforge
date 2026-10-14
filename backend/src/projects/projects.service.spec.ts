import { describe, it, expect, vi } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ProjectStatus, Role } from '@prisma/client';
import { ProjectsService } from './projects.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

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
  const service = new ProjectsService(prisma as unknown as PrismaService);
  return { prisma, service };
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
