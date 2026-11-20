import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NotificationType, Prisma, Role, TaskPriority, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { QueuesService } from '../queues/queues.service.js';
import { AssignTaskInput } from './dto/assign-task.input.js';
import { ChangeTaskStatusInput } from './dto/change-task-status.input.js';
import { CreateTaskInput } from './dto/create-task.input.js';
import { CreateSubtaskInput } from './dto/create-subtask.input.js';
import { AddChecklistItemInput, ChecklistItemInput, ChecklistTaskInput, ReorderChecklistItemsInput, SetChecklistItemCompletedInput, UpdateChecklistItemInput } from './dto/checklist.input.js';
import {
  SortDirection,
  TaskQueryInput,
  TaskSortField,
} from './dto/task-query.input.js';
import { UpdateTaskInput } from './dto/update-task.input.js';
import { PaginatedTasks } from './entities/paginated-tasks.entity.js';
import { TaskChecklist } from './entities/task-checklist.entity.js';
import { TaskActivityInput } from './dto/task-activity.input.js';
import { TaskActivityPage } from './entities/task-activity.entity.js';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly queuesService: QueuesService,
  ) {}

  private async recordActivity(
    tx: Prisma.TransactionClient,
    taskId: string,
    organizationId: string,
    actorId: string,
    type: string,
    details: Prisma.InputJsonObject = {},
  ) {
    await tx.taskActivity.create({ data: { taskId, organizationId, actorId, type, details } });
  }

  async activityHistory(userId: string, input: TaskActivityInput): Promise<TaskActivityPage> {
    await this.get(userId, input.organizationId, input.taskId, true);
    const first = input.first ?? 20;
    if (!Number.isInteger(first) || first < 1 || first > 100) throw new BadRequestException('Invalid activity page size');
    let cursor: { createdAt: string; id: string } | null = null;
    if (input.after) {
      try {
        const value: unknown = JSON.parse(Buffer.from(input.after, 'base64url').toString('utf8'));
        if (!value || typeof value !== 'object' || !('createdAt' in value) || !('id' in value) ||
          typeof value.createdAt !== 'string' || Number.isNaN(Date.parse(value.createdAt)) ||
          typeof value.id !== 'string' || !value.id) throw new Error('Invalid cursor');
        cursor = { createdAt: value.createdAt, id: value.id };
      } catch { throw new BadRequestException('Invalid activity cursor'); }
    }
    const rows = await this.prisma.taskActivity.findMany({
      where: {
        taskId: input.taskId, organizationId: input.organizationId,
        ...(cursor && { OR: [
          { createdAt: { lt: new Date(cursor.createdAt) } },
          { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
        ] }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: first + 1,
    });
    const hasMore = rows.length > first;
    const page = rows.slice(0, first);
    const actors = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(page.map((row) => row.actorId))] } },
      select: { id: true, name: true },
    });
    const names = new Map(actors.map((actor) => [actor.id, actor.name]));
    const last = page.at(-1);
    return {
      items: page.map((row) => ({ ...row, actorName: names.get(row.actorId) ?? null, details: JSON.stringify(row.details ?? {}) })),
      hasMore,
      nextCursor: hasMore && last ? Buffer.from(JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id })).toString('base64url') : null,
    };
  }

  private readonly checklistOrder = [{ position: 'asc' as const }, { id: 'asc' as const }];

  private async checklistAccess(userId: string, input: ChecklistTaskInput, action: 'read' | 'structure' | 'complete') {
    const task = await this.get(userId, input.organizationId, input.taskId);
    if (action === 'read') return task;
    await this.assertProjectActive(input.organizationId, task.projectId);
    const membership = await this.getMembership(userId, input.organizationId);
    if (membership.role === Role.ADMIN || membership.role === Role.MANAGER) return task;
    if (action === 'complete' && task.assigneeId === userId) return task;
    throw new ForbiddenException('Insufficient permission to modify this checklist');
  }

  private validateChecklistContent(content: string) {
    const clean = content?.trim();
    if (!clean || clean.length > 500) throw new BadRequestException('Checklist content must be 1 to 500 characters');
    return clean;
  }

  private async checklistTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt === 2) throw error;
      }
    }
    throw new Error('Checklist transaction retry exhausted');
  }

  async checklist(userId: string, input: ChecklistTaskInput): Promise<TaskChecklist> {
    await this.checklistAccess(userId, input, 'read');
    const items = await this.prisma.taskChecklistItem.findMany({
      where: { organizationId: input.organizationId, taskId: input.taskId },
      orderBy: this.checklistOrder,
    });
    return { items, completedCount: items.filter((item) => item.completed).length, totalCount: items.length };
  }

  async addChecklistItem(userId: string, input: AddChecklistItemInput) {
    await this.checklistAccess(userId, input, 'structure');
    const content = this.validateChecklistContent(input.content);
    if (input.position !== undefined && (!Number.isInteger(input.position) || input.position < 0 || input.position > 499)) {
      throw new BadRequestException('Invalid checklist position');
    }
    return this.checklistTransaction(async (tx) => {
      const items = await tx.taskChecklistItem.findMany({
        where: { organizationId: input.organizationId, taskId: input.taskId },
        orderBy: this.checklistOrder, select: { id: true },
      });
      if (items.length >= 500) throw new BadRequestException('Checklist limit reached');
      const position = input.position ?? items.length;
      if (position > items.length) throw new BadRequestException('Invalid checklist position');
      for (let i = position; i < items.length; i++) {
        await tx.taskChecklistItem.updateMany({ where: { id: items[i]!.id, organizationId: input.organizationId, taskId: input.taskId }, data: { position: i + 1 } });
      }
      const item = await tx.taskChecklistItem.create({ data: { organizationId: input.organizationId, taskId: input.taskId, content, position } });
      await this.recordActivity(tx, input.taskId, input.organizationId, userId, 'CHECKLIST_ITEM_CREATED', { itemId: item.id, position });
      return item;
    });
  }

  private async checklistItemAccess(userId: string, input: ChecklistItemInput, action: 'structure' | 'complete') {
    await this.checklistAccess(userId, input, action);
    const item = await this.prisma.taskChecklistItem.findFirst({ where: { id: input.itemId, organizationId: input.organizationId, taskId: input.taskId } });
    if (!item) throw new NotFoundException('Checklist item not found');
    return item;
  }

  async updateChecklistItem(userId: string, input: UpdateChecklistItemInput) {
    await this.checklistItemAccess(userId, input, 'structure');
    const content = this.validateChecklistContent(input.content);
    const where = { id: input.itemId, organizationId: input.organizationId, taskId: input.taskId };
    return this.checklistTransaction(async (tx) => {
      const item = await tx.taskChecklistItem.findFirst({ where });
      if (!item) throw new NotFoundException('Checklist item not found');
      if (item.content === content) return item;
      const updated = await tx.taskChecklistItem.update({ where: { id: item.id }, data: { content } });
      await this.recordActivity(tx, input.taskId, input.organizationId, userId, 'CHECKLIST_ITEM_UPDATED', { itemId: item.id });
      return updated;
    });
  }

  async setChecklistItemCompleted(userId: string, input: SetChecklistItemCompletedInput) {
    await this.checklistItemAccess(userId, input, 'complete');
    if (typeof input.completed !== 'boolean') throw new BadRequestException('Invalid completion value');
    const where = { id: input.itemId, organizationId: input.organizationId, taskId: input.taskId };
    return this.checklistTransaction(async (tx) => {
      const item = await tx.taskChecklistItem.findFirst({ where });
      if (!item) throw new NotFoundException('Checklist item not found');
      if (item.completed === input.completed) return item;
      const updated = await tx.taskChecklistItem.update({ where: { id: item.id }, data: { completed: input.completed } });
      await this.recordActivity(tx, input.taskId, input.organizationId, userId, 'CHECKLIST_ITEM_COMPLETED',
        { itemId: item.id, old: item.completed, new: input.completed });
      return updated;
    });
  }

  async deleteChecklistItem(userId: string, input: ChecklistItemInput) {
    await this.checklistItemAccess(userId, input, 'structure');
    return this.checklistTransaction(async (tx) => {
      const where = { id: input.itemId, organizationId: input.organizationId, taskId: input.taskId };
      const item = await tx.taskChecklistItem.findFirst({ where });
      if (!item) throw new NotFoundException('Checklist item not found');
      const result = await tx.taskChecklistItem.deleteMany({ where });
      if (result.count !== 1) throw new NotFoundException('Checklist item not found');
      await this.recordActivity(tx, input.taskId, input.organizationId, userId, 'CHECKLIST_ITEM_DELETED',
        { itemId: item.id, completed: item.completed });
      const remaining = await tx.taskChecklistItem.findMany({ where: { organizationId: input.organizationId, taskId: input.taskId }, orderBy: this.checklistOrder, select: { id: true } });
      for (let i = 0; i < remaining.length; i++) {
        await tx.taskChecklistItem.updateMany({ where: { id: remaining[i]!.id, organizationId: input.organizationId, taskId: input.taskId }, data: { position: i } });
      }
      return true;
    });
  }

  async reorderChecklistItems(userId: string, input: ReorderChecklistItemsInput) {
    await this.checklistAccess(userId, input, 'structure');
    if (!Array.isArray(input.itemIds) || input.itemIds.length > 500 || new Set(input.itemIds).size !== input.itemIds.length || input.itemIds.some((id) => typeof id !== 'string' || !id)) {
      throw new BadRequestException('Invalid checklist order');
    }
    return this.checklistTransaction(async (tx) => {
      const where = { organizationId: input.organizationId, taskId: input.taskId };
      const existing = await tx.taskChecklistItem.findMany({ where, select: { id: true } });
      if (existing.length !== input.itemIds.length || existing.some((item) => !input.itemIds.includes(item.id))) {
        throw new BadRequestException('Checklist order must contain every item exactly once');
      }
      for (let i = 0; i < input.itemIds.length; i++) {
        const result = await tx.taskChecklistItem.updateMany({ where: { ...where, id: input.itemIds[i] }, data: { position: i } });
        if (result.count !== 1) throw new NotFoundException('Checklist item not found');
      }
      return tx.taskChecklistItem.findMany({ where, orderBy: this.checklistOrder });
    });
  }

  private async getMembership(userId: string, organizationId: string) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: { userId, organizationId },
      },
      select: { userId: true, organizationId: true, role: true },
    });

    if (!membership) {
      throw new ForbiddenException(
        'You are not a member of this organization',
      );
    }

    return membership;
  }

  private async getProject(organizationId: string, projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: {
        id_organizationId: { id: projectId, organizationId },
      },
      select: { id: true, organizationId: true, status: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  private async assertProjectActive(
    organizationId: string,
    projectId: string,
  ) {
    const project = await this.getProject(organizationId, projectId);

    if (project.status === 'ARCHIVED') {
      throw new BadRequestException(
        'Cannot modify tasks in an archived project',
      );
    }

    return project;
  }

  private async assertProjectMembership(
    userId: string,
    projectId: string,
  ) {
    const projectMembership = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId, userId },
      },
      select: { id: true },
    });

    if (!projectMembership) {
      throw new ForbiddenException(
        'You must be a project member to view project tasks',
      );
    }
  }

  private async assertEligibleAssignee(
    role: Role,
    organizationId: string,
    projectId: string,
    assigneeId: string,
  ) {
    const assignee = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: assigneeId } },
      select: { organizationId: true, orgMember: { select: { role: true } } },
    });
    if (!assignee || assignee.organizationId !== organizationId) {
      throw new BadRequestException('Assignee must be a member of this project');
    }
    if (role === Role.MANAGER && assignee.orgMember.role !== Role.EMPLOYEE) {
      throw new ForbiddenException('Managers can assign tasks only to project employees');
    }
  }

  async create(userId: string, input: CreateTaskInput, parentId?: string) {
    const { organizationId, projectId } = input;

    const membership = await this.getMembership(userId, organizationId);

    if (membership.role !== Role.ADMIN && membership.role !== Role.MANAGER) {
      throw new ForbiddenException('Only admins and managers can create tasks');
    }

    await this.assertProjectActive(organizationId, projectId);

    if (membership.role !== Role.ADMIN) {
      const projectMembership = await this.prisma.projectMember.findUnique({
        where: {
          projectId_userId: { projectId, userId },
        },
        select: { id: true },
      });

      if (!projectMembership) {
        throw new ForbiddenException(
          'You must be a project member to create tasks',
        );
      }
    }

    if (input.assigneeId) {
      await this.assertEligibleAssignee(membership.role, organizationId, projectId, input.assigneeId);
    }

    if (!input.title.trim()) {
      throw new BadRequestException('Task title cannot be empty');
    }

    if (input.dueDate && Number.isNaN(input.dueDate.getTime())) {
      throw new BadRequestException('Invalid due date');
    }

    const occurredAt = new Date().toISOString();

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (parentId) {
        const parent = await tx.task.findFirst({
          where: { id: parentId, organizationId, projectId, deletedAt: null },
          select: { id: true, parentId: true },
        });
        if (!parent) throw new NotFoundException('Parent task not found');
        if (parent.parentId !== null) {
          throw new BadRequestException('Subtasks cannot have subtasks');
        }
      }
      const task = await tx.task.create({
        data: {
          organizationId,
          projectId,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          priority: input.priority ?? TaskPriority.MEDIUM,
          dueDate: input.dueDate,
          createdById: userId,
          assigneeId: input.assigneeId,
          ...(parentId ? { parentId } : {}),
        },
      });

      await this.recordActivity(tx, task.id, organizationId, userId, parentId ? 'SUBTASK_CREATED' : 'TASK_CREATED',
        parentId ? { parentId } : {});
      if (parentId) {
        await this.recordActivity(tx, parentId, organizationId, userId, 'SUBTASK_CREATED', { subtaskId: task.id });
      }

      await tx.outboxEvent.create({
        data: {
          eventType: 'TASK_CREATED',
          payload: {
            eventId: `created-${task.id}`,
            organizationId,
            taskId: task.id,
            actorId: userId,
            eventType: 'TASK_CREATED',
            occurredAt,
          },
        },
      });

      return task;
    });
  }

  createSubtask(userId: string, input: CreateSubtaskInput) {
    const { parentId, ...taskInput } = input;
    return this.create(userId, taskInput, parentId);
  }

  private async requireSubtask(userId: string, organizationId: string, subtaskId: string) {
    const task = await this.get(userId, organizationId, subtaskId) as Awaited<ReturnType<TasksService['get']>> & { parentId?: string | null };
    if (!task.parentId) throw new BadRequestException('Task is not a subtask');
    return { ...task, parentId: task.parentId };
  }

  async listSubtasks(userId: string, organizationId: string, parentId: string) {
    const parent = await this.get(userId, organizationId, parentId) as Awaited<ReturnType<TasksService['get']>> & { parentId?: string | null };
    if (parent.parentId) throw new BadRequestException('Subtasks cannot have subtasks');
    return this.prisma.task.findMany({
      where: { parentId, organizationId, projectId: parent.projectId, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async updateSubtask(userId: string, input: UpdateTaskInput) {
    await this.requireSubtask(userId, input.organizationId, input.taskId);
    return this.update(userId, input);
  }

  async assignSubtask(userId: string, input: AssignTaskInput) {
    await this.requireSubtask(userId, input.organizationId, input.taskId);
    return this.assign(userId, input);
  }

  async changeSubtaskStatus(userId: string, input: ChangeTaskStatusInput) {
    await this.requireSubtask(userId, input.organizationId, input.taskId);
    return this.changeStatus(userId, input);
  }

  async deleteSubtask(userId: string, organizationId: string, subtaskId: string) {
    const subtask = await this.requireSubtask(userId, organizationId, subtaskId);
    // Do not cascade into historical descendants if malformed data exists.
    const descendants = await this.prisma.task.count({
      where: { parentId: subtaskId, organizationId, deletedAt: null },
    });
    if (descendants > 0) throw new BadRequestException('Subtask has child tasks');
    return this.deleteTask(userId, organizationId, subtaskId, subtask.parentId);
  }

  async update(userId: string, input: UpdateTaskInput) {
    const { organizationId, taskId } = input;

    const membership = await this.getMembership(userId, organizationId);

    if (
      membership.role !== Role.ADMIN &&
      membership.role !== Role.MANAGER
    ) {
      throw new ForbiddenException(
        'Only admins and managers can update task details',
      );
    }

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, organizationId, deletedAt: null },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    await this.assertProjectActive(organizationId, task.projectId);

    if (membership.role === Role.MANAGER) {
      await this.assertProjectMembership(userId, task.projectId);
    }

    if (input.title !== undefined && !input.title.trim()) {
      throw new BadRequestException('Task title cannot be empty');
    }

    if (
      input.dueDate instanceof Date &&
      Number.isNaN(input.dueDate.getTime())
    ) {
      throw new BadRequestException('Invalid due date');
    }

    if (input.assigneeId && input.assigneeId !== task.assigneeId) {
      await this.assertEligibleAssignee(membership.role, organizationId, task.projectId, input.assigneeId);
    }

    const data: {
      title?: string;
      description?: string | null;
      priority?: TaskPriority;
      assigneeId?: string | null;
      dueDate?: Date | null;
    } = {};

    if (input.title !== undefined) {
      data.title = input.title.trim();
    }

    if (input.description !== undefined) {
      data.description = input.description?.trim() || null;
    }

    if (input.priority !== undefined) {
      data.priority = input.priority;
    }

    if (input.assigneeId !== undefined) {
      data.assigneeId = input.assigneeId;
    }

    if (input.dueDate !== undefined) {
      data.dueDate = input.dueDate;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Provide at least one field to update');
    }

    const assigneeChanged =
      input.assigneeId !== undefined &&
      input.assigneeId !== task.assigneeId;

    const updatedTask = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const expected: Prisma.TaskWhereUniqueInput = {
        id: taskId, organizationId, projectId: task.projectId, deletedAt: null,
        ...(data.title !== undefined && { title: task.title }),
        ...(data.description !== undefined && { description: task.description }),
        ...(data.priority !== undefined && { priority: task.priority }),
        ...(data.assigneeId !== undefined && { assigneeId: task.assigneeId }),
        ...(data.dueDate !== undefined && { dueDate: task.dueDate }),
      };
      let updatedTask;
      try {
        updatedTask = await tx.task.update({ where: expected, data });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
          throw new ConflictException('Concurrent update detected, please retry');
        }
        throw error;
      }

      const isSubtask = Boolean((task as typeof task & { parentId?: string | null }).parentId);
      const changedFields = [
        input.title !== undefined && data.title !== task.title ? 'title' : null,
        input.description !== undefined && data.description !== task.description ? 'description' : null,
      ].filter((field): field is string => field !== null);
      if (changedFields.length) await this.recordActivity(tx, taskId, organizationId, userId,
        isSubtask ? 'SUBTASK_UPDATED' : 'TASK_UPDATED', { changedFields });
      if (data.priority !== undefined && data.priority !== task.priority) await this.recordActivity(tx, taskId, organizationId, userId,
        isSubtask ? 'SUBTASK_PRIORITY_CHANGED' : 'TASK_PRIORITY_CHANGED', { old: task.priority, new: data.priority });
      if (data.dueDate !== undefined && data.dueDate?.getTime() !== task.dueDate?.getTime()) await this.recordActivity(tx, taskId, organizationId, userId,
        isSubtask ? 'SUBTASK_DEADLINE_CHANGED' : 'TASK_DEADLINE_CHANGED', { old: task.dueDate?.toISOString() ?? null, new: data.dueDate?.toISOString() ?? null });
      if (data.assigneeId !== undefined && data.assigneeId !== task.assigneeId) await this.recordActivity(tx, taskId, organizationId, userId,
        isSubtask ? 'SUBTASK_ASSIGNED' : 'TASK_ASSIGNED', { old: task.assigneeId ?? null, new: data.assigneeId });

      if (
        assigneeChanged &&
        input.assigneeId &&
        input.assigneeId !== userId
      ) {
        await this.notificationsService.createForRecipient(tx, {
          organizationId,
          recipientId: input.assigneeId,
          taskId,
          type: NotificationType.TASK_ASSIGNED,
          message: `You have been assigned to task: ${updatedTask.title}`,
        });
      }

      if (assigneeChanged && input.assigneeId) {
        const occurredAt = new Date().toISOString();

        await tx.outboxEvent.create({
          data: {
            eventType: 'TASK_ASSIGNED',
            payload: {
              eventId: `assigned-${updatedTask.id}-${randomUUID()}`,
              organizationId,
              taskId: updatedTask.id,
              actorId: userId,
              eventType: 'TASK_ASSIGNED',
              occurredAt,
            },
          },
        });
      }

      return updatedTask;
    });

    return updatedTask;
  }

  async assign(userId: string, input: AssignTaskInput) {
    const { organizationId, taskId, assigneeId } = input;

    if (assigneeId === undefined) {
      throw new BadRequestException(
        'Provide assigneeId or null to unassign the task',
      );
    }

    const membership = await this.getMembership(userId, organizationId);

    if (
      membership.role !== Role.ADMIN &&
      membership.role !== Role.MANAGER
    ) {
      throw new ForbiddenException(
        'Only admins and managers can assign tasks',
      );
    }

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, organizationId, deletedAt: null },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    await this.assertProjectActive(organizationId, task.projectId);

    if (membership.role === Role.MANAGER) {
      await this.assertProjectMembership(userId, task.projectId);
    }

    if (assigneeId) {
      await this.assertEligibleAssignee(membership.role, organizationId, task.projectId, assigneeId);
    }

    const normalizedAssigneeId = assigneeId ?? null;
    const assigneeChanged = normalizedAssigneeId !== task.assigneeId;

    const updatedTask = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let updatedTask;
      try {
        updatedTask = await tx.task.update({
          where: { id: taskId, organizationId, projectId: task.projectId, deletedAt: null, assigneeId: task.assigneeId },
          data: { assigneeId: normalizedAssigneeId },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
          throw new ConflictException('Concurrent update detected, please retry');
        }
        throw error;
      }

      if (assigneeChanged) await this.recordActivity(tx, taskId, organizationId, userId,
        (task as typeof task & { parentId?: string | null }).parentId ? 'SUBTASK_ASSIGNED' : 'TASK_ASSIGNED',
        { old: task.assigneeId ?? null, new: normalizedAssigneeId });

      if (
        assigneeChanged &&
        normalizedAssigneeId &&
        normalizedAssigneeId !== userId
      ) {
        await this.notificationsService.createForRecipient(tx, {
          organizationId,
          recipientId: normalizedAssigneeId,
          taskId,
          type: NotificationType.TASK_ASSIGNED,
          message: `You have been assigned to task: ${updatedTask.title}`,
        });
      }

      if (assigneeChanged && normalizedAssigneeId) {
        const occurredAt = new Date().toISOString();

        await tx.outboxEvent.create({
          data: {
            eventType: 'TASK_ASSIGNED',
            payload: {
              eventId: `assigned-${updatedTask.id}-${randomUUID()}`,
              organizationId,
              taskId: updatedTask.id,
              actorId: userId,
              eventType: 'TASK_ASSIGNED',
              occurredAt,
            },
          },
        });
      }

      return updatedTask;
    });

    return updatedTask;
  }

  async changeStatus(userId: string, input: ChangeTaskStatusInput) {
    const { organizationId, taskId, status } = input;

    const membership = await this.getMembership(userId, organizationId);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, organizationId, deletedAt: null },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    await this.assertProjectActive(organizationId, task.projectId);

    if (membership.role === Role.MANAGER) {
      await this.assertProjectMembership(userId, task.projectId);
    }

    if (membership.role === Role.EMPLOYEE) {
      const projectMembership = await this.prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId: task.projectId,
            userId,
          },
        },
        select: { id: true },
      });

      if (!projectMembership) {
        throw new ForbiddenException(
          'You must be a project member to change task status',
        );
      }

      if (task.assigneeId !== userId) {
        throw new ForbiddenException(
          'You can only change the status of tasks assigned to you',
        );
      }
    }

    const allowedTransitions: Record<TaskStatus, TaskStatus[]> = {
      [TaskStatus.TODO]: [TaskStatus.IN_PROGRESS],
      [TaskStatus.IN_PROGRESS]: [TaskStatus.IN_REVIEW],
      [TaskStatus.IN_REVIEW]: [TaskStatus.IN_PROGRESS, TaskStatus.DONE],
      [TaskStatus.DONE]: [],
    };

    if (!allowedTransitions[task.status].includes(status)) {
      throw new BadRequestException('Invalid task status transition');
    }

    if (membership.role === Role.EMPLOYEE && task.status === TaskStatus.IN_REVIEW) {
      throw new ForbiddenException('Only admins and managers can review submitted work');
    }

    const updatedTask = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (status === TaskStatus.IN_PROGRESS || status === TaskStatus.DONE) {
        const projectRows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Project" WHERE id = ${task.projectId} AND "organizationId" = ${organizationId} FOR UPDATE`;
        if (projectRows.length !== 1) throw new NotFoundException('Project not found');
        const blockers = await tx.taskDependency.count({
          where: { organizationId, projectId: task.projectId, taskId, blockingTask: { deletedAt: null, status: { not: TaskStatus.DONE } } },
        });
        if (blockers > 0) throw new ConflictException('Complete blocking tasks before starting work');
      }
      const changed = await tx.task.updateMany({
        where: { id: taskId, organizationId, projectId: task.projectId, deletedAt: null, status: task.status },
        data: { status },
      });
      if (changed.count !== 1) throw new ConflictException('Task status changed; refresh and try again');
      const updatedTask = await tx.task.findUniqueOrThrow({ where: { id: taskId } });

      await this.recordActivity(tx, taskId, organizationId, userId,
        task.status === TaskStatus.IN_REVIEW && status === TaskStatus.DONE ? 'TASK_APPROVED'
          : task.status === TaskStatus.IN_REVIEW && status === TaskStatus.IN_PROGRESS ? 'TASK_CHANGES_REQUESTED'
          : (task as typeof task & { parentId?: string | null }).parentId
            ? 'SUBTASK_STATUS_CHANGED' : 'TASK_STATUS_CHANGED',
        { old: task.status, new: status });

      if (task.createdById !== userId) {
        await this.notificationsService.createForRecipient(tx, {
          organizationId,
          recipientId: task.createdById,
          taskId,
          type: NotificationType.TASK_STATUS_CHANGED,
          message: `Task "${updatedTask.title}" status changed to ${status}`,
        });
      }

      if (task.status === TaskStatus.IN_REVIEW && task.assigneeId && task.assigneeId !== userId && task.assigneeId !== task.createdById) {
        await this.notificationsService.createForRecipient(tx, {
          organizationId, recipientId: task.assigneeId, taskId,
          type: NotificationType.TASK_STATUS_CHANGED,
          message: `Task "${updatedTask.title}" ${status === TaskStatus.DONE ? 'approved' : 'returned for changes'}`,
        });
      }

      const occurredAt = new Date().toISOString();

      await tx.outboxEvent.create({
        data: {
          eventType: 'TASK_STATUS_CHANGED',
          payload: {
            eventId: `status-${updatedTask.id}-${randomUUID()}`,
            organizationId,
            taskId: updatedTask.id,
            actorId: userId,
            eventType: 'TASK_STATUS_CHANGED',
            occurredAt,
          },
        },
      });

      return updatedTask;
    });

    return updatedTask;
  }

  async get(userId: string, organizationId: string, taskId: string, includeDeleted = false) {
    const membership = await this.getMembership(userId, organizationId);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, organizationId, ...(includeDeleted ? {} : { deletedAt: null }) },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (membership.role !== Role.ADMIN) {
      const projectMembership = await this.prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId: task.projectId,
            userId,
          },
        },
        select: { id: true },
      });

      if (!projectMembership) {
        throw new ForbiddenException(
          'You must be a project member to view this task',
        );
      }
    }

    return task;
  }

  async listByProject(
    userId: string,
    organizationId: string,
    projectId: string,
  ) {
    const membership = await this.getMembership(userId, organizationId);

    await this.getProject(organizationId, projectId);

    if (membership.role !== Role.ADMIN) {
      await this.assertProjectMembership(userId, projectId);
    }

    return this.prisma.task.findMany({
      where: { organizationId, projectId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async searchProjectTasks(
    userId: string,
    organizationId: string,
    projectId: string,
    filters: TaskQueryInput = {},
  ): Promise<PaginatedTasks> {
    const membership = await this.getMembership(userId, organizationId);

    await this.getProject(organizationId, projectId);

    if (membership.role !== Role.ADMIN) {
      await this.assertProjectMembership(userId, projectId);
    }

    const {
      status,
      priority,
      assigneeId,
      search,
      sortBy = TaskSortField.CREATED_AT,
      sortDirection = SortDirection.DESC,
      limit = 20,
      offset = 0,
    } = filters;

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('Limit must be an integer between 1 and 100');
    }

    if (!Number.isInteger(offset) || offset < 0) {
      throw new BadRequestException('Offset must be a non-negative integer');
    }

    const allowedSortFields = Object.values(TaskSortField);
    const allowedDirections = Object.values(SortDirection);

    if (!allowedSortFields.includes(sortBy)) {
      throw new BadRequestException('Invalid task sort field');
    }

    if (!allowedDirections.includes(sortDirection)) {
      throw new BadRequestException('Invalid sort direction');
    }

    const normalizedSearch = search?.trim();

    const where = {
      organizationId,
      projectId,
      deletedAt: null,
      ...(status !== undefined && { status }),
      ...(priority !== undefined && { priority }),
      ...(assigneeId !== undefined && { assigneeId }),
      ...(normalizedSearch && {
        OR: [
          {
            title: {
              contains: normalizedSearch,
              mode: 'insensitive' as const,
            },
          },
          {
            description: {
              contains: normalizedSearch,
              mode: 'insensitive' as const,
            },
          },
        ],
      }),
    };

    const orderBy = [
      { [sortBy]: sortDirection },
      { id: 'asc' as const },
    ];

    const [tasks, totalCount] = await Promise.all([
      this.prisma.task.findMany({
        where,
        orderBy,
        take: limit,
        skip: offset,
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      tasks,
      totalCount,
      hasNextPage: offset + tasks.length < totalCount,
      limit,
      offset,
    };
  }

  async deleteTask(
    userId: string,
    organizationId: string,
    taskId: string,
    requiredParentId?: string,
  ): Promise<boolean> {
    const membership = await this.getMembership(userId, organizationId);

    if (
      membership.role !== Role.ADMIN &&
      membership.role !== Role.MANAGER
    ) {
      throw new ForbiddenException(
        'Only admins and managers can delete tasks',
      );
    }

    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
        projectId: true,
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    await this.assertProjectActive(organizationId, task.projectId);

    if (membership.role === Role.MANAGER) {
      await this.assertProjectMembership(userId, task.projectId);
    }

    const where = {
      id: taskId,
      organizationId,
      projectId: task.projectId,
      deletedAt: null,
      ...(requiredParentId ? { parentId: requiredParentId } : {}),
    };
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const now = new Date();
      const projectRows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Project" WHERE id = ${task.projectId} AND "organizationId" = ${organizationId} FOR UPDATE`;
      if (projectRows.length !== 1) throw new NotFoundException('Project not found');
      const affectedTasks = requiredParentId ? [taskId] : [taskId, ...(await tx.task.findMany({
        where: { parentId: taskId, organizationId, projectId: task.projectId, deletedAt: null },
        select: { id: true },
      })).map((child) => child.id)];
      const linkedDependencies = await tx.taskDependency.count({
        where: { organizationId, projectId: task.projectId,
          OR: [{ taskId: { in: affectedTasks } }, { blockingTaskId: { in: affectedTasks } }] },
      });
      if (linkedDependencies > 0) throw new ConflictException('Remove task dependencies before deleting this task');
      if (requiredParentId) {
        const descendants = await tx.task.count({ where: { parentId: taskId, organizationId, deletedAt: null } });
        if (descendants > 0) throw new BadRequestException('Subtask has child tasks');
      }
      // Mark the parent first. The nesting trigger locks the parent when a
      // subtask is inserted, so a concurrent insert either completes before
      // the child scan or sees this tombstone and fails.
      const result = await tx.task.updateMany({ where, data: { deletedAt: now } });
      if (result.count !== 1) throw new NotFoundException('Task not found');
      if (!requiredParentId) {
        const children = await tx.task.findMany({
          where: { parentId: taskId, organizationId, projectId: task.projectId, deletedAt: null },
          select: { id: true },
        });
        for (const child of children) {
          const childResult = await tx.task.updateMany({
            where: { id: child.id, parentId: taskId, organizationId, projectId: task.projectId, deletedAt: null },
            data: { deletedAt: now },
          });
          if (childResult.count === 1) {
            await this.recordActivity(tx, child.id, organizationId, userId, 'SUBTASK_DELETED', { parentId: taskId });
            await this.recordActivity(tx, taskId, organizationId, userId, 'SUBTASK_DELETED', { subtaskId: child.id });
          }
        }
      }
      await this.recordActivity(tx, taskId, organizationId, userId, requiredParentId ? 'SUBTASK_DELETED' : 'TASK_DELETED', {});
      if (requiredParentId) {
        await this.recordActivity(tx, requiredParentId, organizationId, userId, 'SUBTASK_DELETED', { subtaskId: taskId });
      }
      return true;
    });
  }
}
