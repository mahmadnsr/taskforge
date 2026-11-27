import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { TasksService } from './tasks.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const organizationId = 'org';
const taskId = 'task';
const userId = 'user';
const scope = { organizationId, taskId };
const first = { id: 'a', ...scope, content: 'First', completed: true, position: 0 };
const second = { id: 'b', ...scope, content: 'Second', completed: false, position: 1 };

function setup(role: Role | null = Role.ADMIN, assigned = false) {
  let items = [{ ...first }, { ...second }];
  const activity = { create: vi.fn().mockResolvedValue({ id: 'activity' }) };
  const scoped = (where: Record<string, unknown>) => items.filter((item) =>
    (where.id === undefined || item.id === where.id) &&
    (where.taskId === undefined || item.taskId === where.taskId) &&
    (where.organizationId === undefined || item.organizationId === where.organizationId));
  const checklist = {
    findMany: vi.fn(async ({ where }) => scoped(where).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)).map((item) => ({ ...item }))),
    findFirst: vi.fn(async ({ where }) => {
      const item = scoped(where)[0];
      return item ? { ...item } : null;
    }),
    findFirstOrThrow: vi.fn(async ({ where }) => {
      const item = scoped(where)[0];
      if (!item) throw new NotFoundException();
      return { ...item };
    }),
    create: vi.fn(async ({ data }) => {
      const item = { id: 'new', completed: false, ...data };
      items.push(item);
      return { ...item };
    }),
    updateMany: vi.fn(async ({ where, data }) => {
      const matched = scoped(where);
      matched.forEach((item) => Object.assign(item, data));
      return { count: matched.length };
    }),
    update: vi.fn(async ({ where, data }) => {
      const item = scoped(where)[0];
      if (!item) throw new NotFoundException();
      Object.assign(item, data);
      return { ...item };
    }),
    deleteMany: vi.fn(async ({ where }) => {
      const matched = scoped(where);
      items = items.filter((item) => !matched.includes(item));
      return { count: matched.length };
    }),
  };
  const prisma = {
    $transaction: vi.fn(async (fn) => fn({ taskChecklistItem: checklist, taskActivity: activity })),
    organizationMember: { findUnique: vi.fn().mockResolvedValue(role ? { role } : null) },
    projectMember: { findUnique: vi.fn().mockResolvedValue({ id: 'member' }) },
    project: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) },
    task: { findFirst: vi.fn().mockResolvedValue({ id: taskId, organizationId, projectId: 'project', assigneeId: assigned ? userId : 'other' }) },
    taskChecklistItem: checklist,
  };
  const service = new TasksService(prisma as unknown as PrismaService, {} as never, {} as never);
  return { service, prisma, checklist, activity, getItems: () => items };
}

describe('task checklist', () => {
  it('lists in position order with completion counts', async () => {
    const { service } = setup(Role.EMPLOYEE);
    const result = await service.checklist(userId, scope);
    expect(result.items.map((item) => item.id)).toEqual(['a', 'b']);
    expect(result).toMatchObject({ completedCount: 1, totalCount: 2 });
  });

  it('inserts at a requested position and shifts later items atomically', async () => {
    const { service, prisma, getItems } = setup();
    await service.addChecklistItem(userId, { ...scope, content: '  New  ', position: 1 });
    expect(getItems().sort((a, b) => a.position - b.position).map((item) => [item.content, item.position])).toEqual([['First', 0], ['New', 1], ['Second', 2]]);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  });

  it('updates content, sets completion explicitly, deletes, and compacts positions', async () => {
    const { service, getItems } = setup();
    await service.updateChecklistItem(userId, { ...scope, itemId: 'a', content: '  Changed  ' });
    await service.setChecklistItemCompleted(userId, { ...scope, itemId: 'b', completed: true });
    expect(getItems()).toMatchObject([{ content: 'Changed' }, { completed: true }]);
    await expect(service.deleteChecklistItem(userId, { ...scope, itemId: 'a' })).resolves.toBe(true);
    expect(getItems()).toMatchObject([{ id: 'b', position: 0 }]);
  });

  it('reorders the exact task item set and rejects duplicates or foreign IDs', async () => {
    const { service, getItems } = setup();
    await service.reorderChecklistItems(userId, { ...scope, itemIds: ['b', 'a'] });
    expect(getItems().map((item) => [item.id, item.position])).toEqual([['a', 1], ['b', 0]]);
    await expect(service.reorderChecklistItems(userId, { ...scope, itemIds: ['a', 'a'] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.reorderChecklistItems(userId, { ...scope, itemIds: ['a', 'foreign'] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid content, position, and completion values', async () => {
    const { service } = setup();
    await expect(service.addChecklistItem(userId, { ...scope, content: ' ' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.addChecklistItem(userId, { ...scope, content: 'Okay', position: -1 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateChecklistItem(userId, { ...scope, itemId: 'a', content: 'x'.repeat(501) })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.setChecklistItemCompleted(userId, { ...scope, itemId: 'a', completed: 'yes' as never })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks cross-tenant and wrong-task item IDs', async () => {
    const { service, prisma } = setup();
    prisma.task.findFirst.mockResolvedValueOnce(null);
    await expect(service.checklist(userId, { organizationId: 'other', taskId })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateChecklistItem(userId, { ...scope, itemId: 'foreign', content: 'x' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('preserves role and project permissions', async () => {
    const employee = setup(Role.EMPLOYEE);
    await expect(employee.service.addChecklistItem(userId, { ...scope, content: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(employee.service.setChecklistItemCompleted(userId, { ...scope, itemId: 'a', completed: false })).rejects.toBeInstanceOf(ForbiddenException);
    const assigned = setup(Role.EMPLOYEE, true);
    await expect(assigned.service.setChecklistItemCompleted(userId, { ...scope, itemId: 'a', completed: false })).resolves.toMatchObject({ completed: false });
    const manager = setup(Role.MANAGER);
    manager.prisma.projectMember.findUnique.mockResolvedValue(null);
    await expect(manager.service.checklist(userId, scope)).rejects.toBeInstanceOf(ForbiddenException);
    const outsider = setup(null);
    await expect(outsider.service.checklist(userId, scope)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('retries a serialization conflict before applying an order', async () => {
    const { service, prisma } = setup();
    const run = prisma.$transaction.getMockImplementation()!;
    prisma.$transaction.mockImplementationOnce(async () => {
      throw new Prisma.PrismaClientKnownRequestError('Conflict', { code: 'P2034', clientVersion: '6.19.3' });
    }).mockImplementation(run);
    await service.reorderChecklistItems(userId, { ...scope, itemIds: ['b', 'a'] });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('records create, edit, completion and deletion without storing content', async () => {
    const { service, activity } = setup();
    await service.addChecklistItem(userId, { ...scope, content: 'Sensitive item' });
    await service.updateChecklistItem(userId, { ...scope, itemId: 'a', content: 'New private text' });
    await service.setChecklistItemCompleted(userId, { ...scope, itemId: 'b', completed: true });
    await service.deleteChecklistItem(userId, { ...scope, itemId: 'a' });
    const events = activity.create.mock.calls.map(([call]) => call.data);
    expect(events.map((event) => event.type)).toEqual(['CHECKLIST_ITEM_CREATED', 'CHECKLIST_ITEM_UPDATED', 'CHECKLIST_ITEM_COMPLETED', 'CHECKLIST_ITEM_DELETED']);
    expect(events.every((event) => event.taskId === taskId && event.organizationId === organizationId && event.actorId === userId)).toBe(true);
    expect(events[2].details).toEqual({ itemId: 'b', old: false, new: true });
    expect(JSON.stringify(events)).not.toContain('private text');
    expect(JSON.stringify(events)).not.toContain('Sensitive item');
  });

  it('does not record unchanged content or completion', async () => {
    const { service, activity } = setup();
    await service.updateChecklistItem(userId, { ...scope, itemId: 'a', content: 'First' });
    await service.setChecklistItemCompleted(userId, { ...scope, itemId: 'a', completed: true });
    expect(activity.create).not.toHaveBeenCalled();
  });

  it('fails the checklist transaction if activity insertion fails', async () => {
    const { service, activity } = setup();
    activity.create.mockRejectedValueOnce(new Error('activity write failed'));
    await expect(service.addChecklistItem(userId, { ...scope, content: 'new' })).rejects.toThrow('activity write failed');
  });
});
