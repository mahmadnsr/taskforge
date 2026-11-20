import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { Role, TaskStatus } from '@prisma/client';
import { DashboardService } from './dashboard.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const ORG = 'org-1';
const OTHER_ORG = 'org-2';
const USER = 'user-1';
const OTHER_USER = 'user-2';

function setup(role: Role | null = Role.ADMIN) {
  const prisma = {
    organizationMember: {
      findFirst: vi.fn().mockResolvedValue(role ? { id: 'member-1', role } : null),
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
      const { service, prisma } = setup(null);

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
          role: true,
        },
      });

      expect(prisma.project.count).not.toHaveBeenCalled();
      expect(prisma.task.groupBy).not.toHaveBeenCalled();
      expect(prisma.task.count).not.toHaveBeenCalled();
    });

    describe('ADMIN', () => {
      it('returns correct project and task metrics', async () => {
        const { service } = setup(Role.ADMIN);

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
        const { service, prisma } = setup(Role.ADMIN);

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
            deletedAt: null,
            parentId: null,
          },
          _count: {
            _all: true,
          },
        });

        expect(prisma.task.count).toHaveBeenCalledWith({
          where: {
            organizationId: ORG,
            deletedAt: null,
            parentId: null,
            dueDate: {
              lt: expect.any(Date),
            },
            status: {
              not: TaskStatus.DONE,
            },
          },
        });
      });

      it('does not apply project membership filter for ADMIN', async () => {
        const { service, prisma } = setup(Role.ADMIN);

        await service.getSummary(USER, ORG);

        const projectCall = prisma.project.count.mock.calls[0][0];
        expect(projectCall.where).not.toHaveProperty('members');

        const taskGroupCall = prisma.task.groupBy.mock.calls[0][0];
        expect(taskGroupCall.where).not.toHaveProperty('project');

        const taskCountCall = prisma.task.count.mock.calls[0][0];
        expect(taskCountCall.where).not.toHaveProperty('project');
      });

      it('counts TODO, IN_PROGRESS and DONE separately', async () => {
        const { service, prisma } = setup(Role.ADMIN);

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
        const { service, prisma } = setup(Role.ADMIN);

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
        const { service, prisma } = setup(Role.ADMIN);

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

    describe('MANAGER', () => {
      it('scopes project count to assigned projects only', async () => {
        const { service, prisma } = setup(Role.MANAGER);
        prisma.project.count.mockResolvedValue(3);

        const result = await service.getSummary(USER, ORG);

        expect(result.totalProjects).toBe(3);
        expect(prisma.project.count).toHaveBeenCalledWith({
          where: {
            organizationId: ORG,
            members: {
              some: {
                userId: USER,
                organizationId: ORG,
              },
            },
          },
        });
      });

      it('scopes task groupBy to assigned projects only', async () => {
        const { service, prisma } = setup(Role.MANAGER);
        prisma.task.groupBy.mockResolvedValue([
          { status: TaskStatus.TODO, _count: { _all: 2 } },
          { status: TaskStatus.DONE, _count: { _all: 1 } },
        ]);

        await service.getSummary(USER, ORG);

        expect(prisma.task.groupBy).toHaveBeenCalledWith({
          by: ['status'],
          where: {
            organizationId: ORG,
            deletedAt: null,
            parentId: null,
            project: {
              members: {
                some: {
                  userId: USER,
                  organizationId: ORG,
                },
              },
            },
          },
          _count: {
            _all: true,
          },
        });
      });

      it('scopes overdue task count to assigned projects only', async () => {
        const { service, prisma } = setup(Role.MANAGER);
        prisma.task.count.mockResolvedValue(1);

        await service.getSummary(USER, ORG);

        expect(prisma.task.count).toHaveBeenCalledWith({
          where: {
            organizationId: ORG,
            deletedAt: null,
            parentId: null,
            project: {
              members: {
                some: {
                  userId: USER,
                  organizationId: ORG,
                },
              },
            },
            dueDate: {
              lt: expect.any(Date),
            },
            status: {
              not: TaskStatus.DONE,
            },
          },
        });
      });

      it('returns only assigned project metrics for MANAGER', async () => {
        const { service, prisma } = setup(Role.MANAGER);
        prisma.project.count.mockResolvedValue(3);
        prisma.task.groupBy.mockResolvedValue([
          { status: TaskStatus.TODO, _count: { _all: 2 } },
          { status: TaskStatus.IN_PROGRESS, _count: { _all: 1 } },
          { status: TaskStatus.DONE, _count: { _all: 0 } },
        ]);
        prisma.task.count.mockResolvedValue(0);

        await expect(service.getSummary(USER, ORG)).resolves.toEqual({
          totalProjects: 3,
          totalTasks: 3,
          pendingTasks: 2,
          inProgressTasks: 1,
          completedTasks: 0,
          overdueTasks: 0,
        });
      });

      it('does not see tasks from unassigned projects', async () => {
        const { service, prisma } = setup(Role.MANAGER);

        await service.getSummary(USER, ORG);

        const taskWhere = prisma.task.groupBy.mock.calls[0][0].where;
        expect(taskWhere.project).toBeDefined();
        expect(taskWhere.project.members.some.userId).toBe(USER);
        expect(taskWhere.project.members.some.organizationId).toBe(ORG);
      });
    });

    describe('EMPLOYEE', () => {
      it('scopes project count to assigned projects only', async () => {
        const { service, prisma } = setup(Role.EMPLOYEE);
        prisma.project.count.mockResolvedValue(2);

        const result = await service.getSummary(USER, ORG);

        expect(result.totalProjects).toBe(2);
        expect(prisma.project.count).toHaveBeenCalledWith({
          where: {
            organizationId: ORG,
            members: {
              some: {
                userId: USER,
                organizationId: ORG,
              },
            },
          },
        });
      });

      it('scopes task groupBy to assigned projects only', async () => {
        const { service, prisma } = setup(Role.EMPLOYEE);
        prisma.task.groupBy.mockResolvedValue([
          { status: TaskStatus.TODO, _count: { _all: 1 } },
        ]);

        await service.getSummary(USER, ORG);

        expect(prisma.task.groupBy).toHaveBeenCalledWith({
          by: ['status'],
          where: {
            organizationId: ORG,
            deletedAt: null,
            parentId: null,
            project: {
              members: {
                some: {
                  userId: USER,
                  organizationId: ORG,
                },
              },
            },
          },
          _count: {
            _all: true,
          },
        });
      });

      it('scopes overdue task count to assigned projects only', async () => {
        const { service, prisma } = setup(Role.EMPLOYEE);
        prisma.task.count.mockResolvedValue(0);

        await service.getSummary(USER, ORG);

        expect(prisma.task.count).toHaveBeenCalledWith({
          where: {
            organizationId: ORG,
            deletedAt: null,
            parentId: null,
            project: {
              members: {
                some: {
                  userId: USER,
                  organizationId: ORG,
                },
              },
            },
            dueDate: {
              lt: expect.any(Date),
            },
            status: {
              not: TaskStatus.DONE,
            },
          },
        });
      });

      it('returns only assigned project metrics for EMPLOYEE', async () => {
        const { service, prisma } = setup(Role.EMPLOYEE);
        prisma.project.count.mockResolvedValue(2);
        prisma.task.groupBy.mockResolvedValue([
          { status: TaskStatus.TODO, _count: { _all: 1 } },
          { status: TaskStatus.DONE, _count: { _all: 1 } },
        ]);
        prisma.task.count.mockResolvedValue(0);

        await expect(service.getSummary(USER, ORG)).resolves.toEqual({
          totalProjects: 2,
          totalTasks: 2,
          pendingTasks: 1,
          inProgressTasks: 0,
          completedTasks: 1,
          overdueTasks: 0,
        });
      });
    });

    describe('empty project membership', () => {
      it('returns zero counts when MANAGER has no project assignments', async () => {
        const { service, prisma } = setup(Role.MANAGER);
        prisma.project.count.mockResolvedValue(0);
        prisma.task.groupBy.mockResolvedValue([]);
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

      it('returns zero counts when EMPLOYEE has no project assignments', async () => {
        const { service, prisma } = setup(Role.EMPLOYEE);
        prisma.project.count.mockResolvedValue(0);
        prisma.task.groupBy.mockResolvedValue([]);
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
    });

    describe('cross-organization isolation', () => {
      it('does not include project memberships from another organization', async () => {
        const { service, prisma } = setup(Role.MANAGER);

        await service.getSummary(USER, OTHER_ORG);

        expect(prisma.project.count).toHaveBeenCalledWith({
          where: {
            organizationId: OTHER_ORG,
            members: {
              some: {
                userId: USER,
                organizationId: OTHER_ORG,
              },
            },
          },
        });

        const taskWhere = prisma.task.groupBy.mock.calls[0][0].where;
        expect(taskWhere.organizationId).toBe(OTHER_ORG);
        expect(taskWhere.project.members.some.organizationId).toBe(OTHER_ORG);
        expect(taskWhere.project.members.some.userId).toBe(USER);
      });
    });
  });
});
