import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role, TaskStatus } from '@prisma/client';
import { validate } from 'class-validator';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AnalyticsService } from './analytics.service.js';
import { EmployeeAnalyticsInput } from './dto/analytics.input.js';

const org = 'org-1';
const project = 'project-1';
const caller = 'user-1';
const employee = 'user-2';
const old = new Date(Date.now() - 24 * 60 * 60 * 1000);
const future = new Date(Date.now() + 24 * 60 * 60 * 1000);

function setup(role: Role | null = Role.ADMIN) {
  const prisma = {
    organizationMember: { findFirst: vi.fn().mockResolvedValue(role ? { role } : null) },
    project: { findFirst: vi.fn().mockResolvedValue({ id: project }) },
    projectMember: {
      findUnique: vi.fn().mockResolvedValue({ id: 'membership' }),
      findMany: vi.fn().mockResolvedValue([{ userId: caller }, { userId: employee }]),
    },
    task: {
      findFirst: vi.fn().mockResolvedValue({ id: 'task-1', projectId: project, parentId: null, status: TaskStatus.TODO, checklistItems: [{ completed: true }] }),
      findMany: vi.fn().mockResolvedValue([
        { id: 'task-1', parentId: null, projectId: project, project: { name: 'Project' }, status: TaskStatus.TODO, dueDate: old, assigneeId: employee, checklistItems: [{ completed: true }] },
        { id: 'child-1', parentId: 'task-1', projectId: project, project: { name: 'Project' }, status: TaskStatus.DONE, dueDate: future, assigneeId: employee, checklistItems: [] },
      ]),
    },
    taskActivity: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findMany: vi.fn().mockResolvedValue([{ id: employee, name: 'Teammate' }]) },
  };
  return { service: new AnalyticsService(prisma as unknown as PrismaService), prisma };
}

describe('AnalyticsService', () => {
  it('rejects malformed analytics IDs through the GraphQL input validators', async () => {
    const input = Object.assign(new EmployeeAnalyticsInput(), { organizationId: 'other-org', employeeId: 'bad', projectId: 'bad' });
    expect((await validate(input)).map((error) => error.property).sort()).toEqual(['employeeId', 'organizationId', 'projectId']);
  });

  it('rejects outsiders before reading any task data', async () => {
    const { service, prisma } = setup(null);
    await expect(service.projectProgress(caller, org, project)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.task.findMany).not.toHaveBeenCalled();
  });

  it('prevents cross-organization and cross-project access', async () => {
    const { service, prisma } = setup(Role.MANAGER);
    prisma.project.findFirst.mockResolvedValueOnce(null);
    await expect(service.projectAnalytics(caller, 'other-org', project)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.project.findFirst).toHaveBeenCalledWith({ where: { id: project, organizationId: 'other-org' }, select: { id: true } });
    prisma.projectMember.findUnique.mockResolvedValueOnce(null);
    await expect(service.projectProgress(caller, org, project)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.task.findMany).not.toHaveBeenCalled();
  });

  it('hides deleted tasks and children from progress and checks parent task access', async () => {
    const { service, prisma } = setup(Role.MANAGER);
    await expect(service.projectProgress(caller, org, project)).resolves.toEqual({ projectId: project, taskCount: 1, percent: 100 });
    expect(prisma.task.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: org, projectId: project, deletedAt: null } }));
    await service.taskProgress(caller, org, 'task-1');
    expect(prisma.task.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { parentId: 'task-1', organizationId: org, projectId: project, deletedAt: null } }));
    prisma.task.findFirst.mockResolvedValueOnce(null);
    await expect(service.taskProgress(caller, org, 'deleted-task')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('limits employees to their own analytics and scopes manager queries to joined projects', async () => {
    const employeeSetup = setup(Role.EMPLOYEE);
    await expect(employeeSetup.service.employeeAnalytics(caller, org, employee)).rejects.toBeInstanceOf(ForbiddenException);
    const managerSetup = setup(Role.MANAGER);
    await managerSetup.service.employeeAnalytics(caller, org, employee);
    expect(managerSetup.prisma.task.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: org, assigneeId: employee, deletedAt: null, project: { members: { some: { userId: caller, organizationId: org } } } }),
    }));
  });

  it('counts completion timing only when completion and deadline are reliable', async () => {
    const { service, prisma } = setup();
    prisma.task.findMany.mockResolvedValue([
      { id: 'on-time', projectId: project, project: { name: 'Project' }, status: TaskStatus.DONE, dueDate: future },
      { id: 'late', projectId: project, project: { name: 'Project' }, status: TaskStatus.DONE, dueDate: old },
      { id: 'unknown', projectId: project, project: { name: 'Project' }, status: TaskStatus.DONE, dueDate: future },
    ]);
    prisma.taskActivity.findMany.mockResolvedValue([
      { taskId: 'on-time', type: 'TASK_STATUS_CHANGED', details: { new: 'DONE' }, createdAt: old },
      { taskId: 'late', type: 'TASK_STATUS_CHANGED', details: { new: 'DONE' }, createdAt: future },
      { taskId: 'unknown', type: 'TASK_DEADLINE_CHANGED', details: {}, createdAt: future },
      { taskId: 'unknown', type: 'TASK_STATUS_CHANGED', details: { new: 'DONE' }, createdAt: old },
    ]);
    const result = await service.employeeAnalytics(caller, org, employee);
    expect(result).toMatchObject({ assigned: 3, completed: 3, completionRate: 100, onTimeCompleted: 1, lateCompleted: 1, timingUnknown: 1 });
  });

  it('returns project health, workload, status, and recent activity without exposing details', async () => {
    const { service, prisma } = setup();
    prisma.taskActivity.findMany.mockResolvedValue([{ taskId: 'task-1', type: 'TASK_CREATED', actorId: employee, createdAt: old }]);
    const result = await service.projectAnalytics(caller, org, project);
    expect(result.health).toBe('AT_RISK');
    expect(result.progress).toEqual({ projectId: project, taskCount: 1, percent: 100 });
    expect(result.memberWorkload).toContainEqual({ userId: employee, name: 'Teammate', assigned: 2, completed: 1, overdue: 1 });
    expect(result.recentActivity).toEqual([{ taskId: 'task-1', type: 'TASK_CREATED', actorName: 'Teammate', createdAt: old }]);
    expect(prisma.taskActivity.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: org, task: { projectId: project, organizationId: org } }, take: 10 }));
  });

  it('marks empty projects EMPTY and fully completed projects COMPLETE', async () => {
    const { service, prisma } = setup();
    prisma.task.findMany.mockResolvedValueOnce([]);
    expect((await service.projectAnalytics(caller, org, project)).health).toBe('EMPTY');
    prisma.task.findMany.mockResolvedValueOnce([{ id: 'done', parentId: null, status: TaskStatus.DONE, dueDate: old, assigneeId: employee, checklistItems: [] }]);
    expect((await service.projectAnalytics(caller, org, project)).health).toBe('COMPLETE');
  });
});
