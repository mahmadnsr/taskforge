import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role, TaskStatus } from '@prisma/client';
import { TasksService } from './tasks.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { NotificationsService } from '../notifications/notifications.service.js';

const org = 'org';
const project = 'project';
const parentId = 'parent';
const childId = 'child';
const user = 'user';

function setup(role: Role | null = Role.ADMIN) {
  const parent = { id: parentId, organizationId: org, projectId: project, parentId: null };
  const child = { id: childId, organizationId: org, projectId: project, parentId, status: TaskStatus.TODO, assigneeId: user, createdById: user };
  const tx = {
    taskActivity: { create: vi.fn().mockResolvedValue({ id: 'activity-1' }), findMany: vi.fn().mockResolvedValue([]) },
    task: {
      findFirst: vi.fn().mockResolvedValue(parent),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(async ({ data }) => ({ id: childId, ...data })),
      update: vi.fn().mockImplementation(async ({ data }) => ({ ...child, ...data })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    outboxEvent: { create: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn(async (fn) => fn(tx)),
    organizationMember: { findUnique: vi.fn().mockResolvedValue(role ? { role } : null) },
    project: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) },
    projectMember: { findUnique: vi.fn().mockResolvedValue({ id: 'member' }) },
    task: {
      findFirst: vi.fn().mockResolvedValue(parent),
      findMany: vi.fn().mockResolvedValue([child]),
      count: vi.fn().mockResolvedValue(0),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const notifications = { createForRecipient: vi.fn() };
  const service = new TasksService(prisma as unknown as PrismaService, notifications as unknown as NotificationsService, {} as never);
  return { service, prisma, tx, parent, child };
}

const createInput = { organizationId: org, projectId: project, parentId, title: 'Child' };

describe('subtasks', () => {
  it('creates a child in the same organization and project using task creation', async () => {
    const { service, tx } = setup();
    await service.createSubtask(user, createInput);
    expect(tx.task.findFirst).toHaveBeenCalledWith({ where: { id: parentId, organizationId: org, projectId: project, deletedAt: null }, select: { id: true, parentId: true } });
    expect(tx.task.create).toHaveBeenCalledWith({ data: expect.objectContaining({ parentId, organizationId: org, projectId: project }) });
  });

  it('rejects a child of a subtask', async () => {
    const { service, tx } = setup();
    tx.task.findFirst.mockResolvedValueOnce({ id: parentId, parentId: 'grandparent' });
    await expect(service.createSubtask(user, createInput)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.task.create).not.toHaveBeenCalled();
  });

  it('rejects a parent in another project or organization', async () => {
    const { service, tx } = setup();
    tx.task.findFirst.mockResolvedValueOnce(null);
    await expect(service.createSubtask(user, createInput)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.task.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: parentId, organizationId: org, projectId: project, deletedAt: null },
    }));
    expect(tx.task.create).not.toHaveBeenCalled();
  });

  it('requires membership and project access when creating', async () => {
    const outsider = setup(null);
    await expect(outsider.service.createSubtask(user, createInput)).rejects.toBeInstanceOf(ForbiddenException);
    const employee = setup(Role.EMPLOYEE);
    employee.prisma.projectMember.findUnique.mockResolvedValue(null);
    await expect(employee.service.createSubtask(user, createInput)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lists only children of a visible root task in its project', async () => {
    const { service, prisma } = setup(Role.MANAGER);
    await expect(service.listSubtasks(user, org, parentId)).resolves.toHaveLength(1);
    expect(prisma.task.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: org, projectId: project, parentId, deletedAt: null } }));
    prisma.task.findFirst.mockResolvedValueOnce(null);
    await expect(service.listSubtasks(user, 'other-org', parentId)).rejects.toBeInstanceOf(NotFoundException);
    prisma.projectMember.findUnique.mockResolvedValue(null);
    await expect(service.listSubtasks(user, org, parentId)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reuses task detail, assignment, and status rules for children', async () => {
    const { service, prisma, tx, child } = setup();
    prisma.task.findFirst.mockResolvedValue(child);
    await service.updateSubtask(user, { organizationId: org, taskId: childId, title: 'Updated' });
    await service.assignSubtask(user, { organizationId: org, taskId: childId, assigneeId: null });
    await service.changeSubtaskStatus(user, { organizationId: org, taskId: childId, status: TaskStatus.IN_PROGRESS });
    expect(tx.task.update).toHaveBeenCalledTimes(3);
  });

  it('keeps employee detail edits and deletion forbidden', async () => {
    const { service, prisma, child } = setup(Role.EMPLOYEE);
    prisma.task.findFirst.mockResolvedValue(child);
    await expect(service.updateSubtask(user, { organizationId: org, taskId: childId, title: 'Updated' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.deleteSubtask(user, org, childId)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('soft-deletes only the requested child and blocks malformed descendants', async () => {
    const { service, prisma, tx, child } = setup();
    prisma.task.findFirst.mockResolvedValue(child);
    await expect(service.deleteSubtask(user, org, childId)).resolves.toBe(true);
    expect(tx.task.updateMany).toHaveBeenCalledWith({ where: { id: childId, organizationId: org, projectId: project, parentId, deletedAt: null }, data: { deletedAt: expect.any(Date) } });
    prisma.task.count.mockResolvedValueOnce(1);
    await expect(service.deleteSubtask(user, org, childId)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.task.updateMany).toHaveBeenCalledTimes(1);
  });

  it('retains subtask history on its tombstone and records deletion on the parent', async () => {
    const { service, prisma, tx, child } = setup();
    await service.createSubtask(user, createInput);
    expect(tx.taskActivity.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: 'SUBTASK_CREATED', taskId: parentId }) });
    prisma.task.findFirst.mockResolvedValue(child);
    await service.deleteSubtask(user, org, childId);
    expect(tx.taskActivity.findMany).not.toHaveBeenCalled();
    expect(tx.taskActivity.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: 'SUBTASK_DELETED', taskId: childId, actorId: user }) });
    expect(tx.taskActivity.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: 'SUBTASK_DELETED', taskId: parentId }) });
  });

  it('records subtask edits and completion', async () => {
    const { service, prisma, tx, child } = setup();
    prisma.task.findFirst.mockResolvedValue({ ...child, title: 'Old', priority: 'LOW', dueDate: null });
    await service.updateSubtask(user, { organizationId: org, taskId: childId, title: 'New', priority: 'HIGH' as never });
    await service.changeSubtaskStatus(user, { organizationId: org, taskId: childId, status: TaskStatus.IN_PROGRESS });
    prisma.task.findFirst.mockResolvedValue({ ...child, status: TaskStatus.IN_REVIEW });
    await service.changeSubtaskStatus(user, { organizationId: org, taskId: childId, status: TaskStatus.DONE });
    expect(tx.taskActivity.create.mock.calls.map(([call]) => call.data.type)).toEqual(['SUBTASK_UPDATED', 'SUBTASK_PRIORITY_CHANGED', 'SUBTASK_STATUS_CHANGED', 'SUBTASK_COMPLETED']);
  });
});
