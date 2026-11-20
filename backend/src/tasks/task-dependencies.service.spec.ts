import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role, TaskStatus } from '@prisma/client';
import { TaskDependenciesService } from './task-dependencies.service.js';

function setup(role: Role = Role.MANAGER) {
  const rows = [
    { id: 'a', status: TaskStatus.TODO },
    { id: 'b', status: TaskStatus.TODO },
  ];
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'project' }]),
    task: { findMany: vi.fn().mockResolvedValue(rows) },
    taskDependency: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ taskId: 'a', blockingTaskId: 'b' }),
    },
  };
  const prisma = {
    organizationMember: { findUnique: vi.fn().mockResolvedValue({ role }) },
    taskDependency: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const tasks = { get: vi.fn().mockResolvedValue({ id: 'a', projectId: 'project' }) };
  const service = new TaskDependenciesService(prisma as never, tasks as never);
  return { service, tx, prisma, tasks };
}

describe('task dependencies', () => {
  it('creates a same-project edge after taking a database project lock', async () => {
    const { service, tx } = setup();
    await service.add('manager', 'org', 'a', 'b');
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.task.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['a', 'b'] }, organizationId: 'org', projectId: 'project', deletedAt: null },
    }));
    expect(tx.taskDependency.create).toHaveBeenCalledOnce();
  });

  it('rejects employee edits and self edges', async () => {
    const employee = setup(Role.EMPLOYEE);
    await expect(employee.service.add('employee', 'org', 'a', 'b')).rejects.toBeInstanceOf(ForbiddenException);
    expect(employee.tx.taskDependency.create).not.toHaveBeenCalled();
    const manager = setup();
    await expect(manager.service.add('manager', 'org', 'a', 'a')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate, direct, and indirect cycles', async () => {
    const duplicate = setup();
    duplicate.tx.taskDependency.findMany.mockResolvedValue([{ taskId: 'a', blockingTaskId: 'b' }]);
    await expect(duplicate.service.add('manager', 'org', 'a', 'b')).rejects.toBeInstanceOf(ConflictException);
    const direct = setup();
    direct.tx.taskDependency.findMany.mockResolvedValue([{ taskId: 'b', blockingTaskId: 'a' }]);
    await expect(direct.service.add('manager', 'org', 'a', 'b')).rejects.toBeInstanceOf(BadRequestException);
    const indirect = setup();
    indirect.tx.taskDependency.findMany.mockResolvedValue([{ taskId: 'b', blockingTaskId: 'c' }, { taskId: 'c', blockingTaskId: 'a' }]);
    await expect(indirect.service.add('manager', 'org', 'a', 'b')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects missing, deleted, cross-project, and cross-organization blocker IDs', async () => {
    const { service, tx } = setup();
    tx.task.findMany.mockResolvedValueOnce([{ id: 'a', status: TaskStatus.TODO }]);
    await expect(service.add('manager', 'org', 'a', 'b')).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.taskDependency.create).not.toHaveBeenCalled();
  });

  it('rejects a new incomplete blocker on active work', async () => {
    const { service, tx } = setup();
    tx.task.findMany.mockResolvedValueOnce([{ id: 'a', status: TaskStatus.IN_PROGRESS }, { id: 'b', status: TaskStatus.TODO }]);
    await expect(service.add('manager', 'org', 'a', 'b')).rejects.toBeInstanceOf(ConflictException);
  });
});
