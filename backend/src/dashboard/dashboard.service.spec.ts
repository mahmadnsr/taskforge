import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { DashboardService } from './dashboard.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const ORG = 'org-1';
const USER = 'user-1';

function setup(isMember = true) {
  const prisma = {
    organizationMember: {
      findFirst: vi.fn().mockResolvedValue(isMember ? { id: 'member-1' } : null),
    },
    project: {
      count: vi.fn().mockResolvedValue(5),
    },
    task: {
      groupBy: vi.fn().mockResolvedValue([
        { status: TaskStatus.TODO, _count: { _all: 3 } },
        { status: TaskStatus.IN_PROGRESS, _count: { _all: 2 } },
        { status: TaskStatus.IN_REVIEW, _count: { _all: 4 } },
        { status: TaskStatus.DONE, _count: { _all: 6 } },
      ]),
      count: vi.fn().mockResolvedValue(2),
    },
  };

  const service = new DashboardService(
    prisma as unknown as PrismaService,
  );

  return { prisma, service };
}

describe('DashboardService', () => {
  describe('getSummary', () => {
    it('rejects non-members before querying dashboard metrics', async () => {
      const { service, prisma } = setup(false);

      await expect(service.getSummary(USER, ORG)).rejects.toThrow(
        ForbiddenException,
      );

      expect(prisma.organizationMember.findFirst).toHaveBeenCalledWith({
        where: {
          userId: USER,
          organizationId: ORG,
        },
        select: {
          id: true,
        },
      });

      expect(prisma.project.count).not.toHaveBeenCalled();
      expect(prisma.task.groupBy).not.toHaveBeenCalled();
      expect(prisma.task.count).not.toHaveBeenCalled();
    });

    it('returns correct project and task metrics', async () => {
      const { service } = setup();

      await expect(service.getSummary(USER, ORG)).resolves.toEqual({
        totalProjects: 5,
        totalTasks: 15,
        pendingTasks: 3,
        inProgressTasks: 2,
        completedTasks: 6,
        overdueTasks: 2,
      });
    });

    it('scopes every metric query to the requested organization', async () => {
      const { service, prisma } = setup();

      await service.getSummary(USER, ORG);

      expect(prisma.project.count).toHaveBeenCalledWith({
        where: {
          organizationId: ORG,
        },
      });

      expect(prisma.task.groupBy).toHaveBeenCalledWith({
        by: ['status'],
        where: {
          organizationId: ORG,
        },
        _count: {
          _all: true,
        },
      });

      expect(prisma.task.count).toHaveBeenCalledWith({
        where: {
          organizationId: ORG,
          dueDate: {
            lt: expect.any(Date),
          },
          status: {
            not: TaskStatus.DONE,
          },
        },
      });
    });

    it('counts TODO, IN_PROGRESS and DONE separately', async () => {
      const { service, prisma } = setup();

      prisma.task.groupBy.mockResolvedValue([
        { status: TaskStatus.TODO, _count: { _all: 7 } },
        { status: TaskStatus.IN_PROGRESS, _count: { _all: 3 } },
        { status: TaskStatus.DONE, _count: { _all: 9 } },
      ] as never);

      await expect(service.getSummary(USER, ORG)).resolves.toMatchObject({
        totalTasks: 19,
        pendingTasks: 7,
        inProgressTasks: 3,
        completedTasks: 9,
      });
    });

    it('returns zero counts when the organization has no projects or tasks', async () => {
      const { service, prisma } = setup();

      prisma.project.count.mockResolvedValue(0);
      prisma.task.groupBy.mockResolvedValue([] as never);
      prisma.task.count.mockResolvedValue(0);

      await expect(service.getSummary(USER, ORG)).resolves.toEqual({
        totalProjects: 0,
        totalTasks: 0,
        pendingTasks: 0,
        inProgressTasks: 0,
        completedTasks: 0,
        overdueTasks: 0,
      });
    });

    it('includes IN_REVIEW tasks in totalTasks without adding them to other status counts', async () => {
      const { service, prisma } = setup();

      prisma.task.groupBy.mockResolvedValue([
        { status: TaskStatus.IN_REVIEW, _count: { _all: 8 } },
      ] as never);

      await expect(service.getSummary(USER, ORG)).resolves.toEqual({
        totalProjects: 5,
        totalTasks: 8,
        pendingTasks: 0,
        inProgressTasks: 0,
        completedTasks: 0,
        overdueTasks: 2,
      });
    });
  });
});
