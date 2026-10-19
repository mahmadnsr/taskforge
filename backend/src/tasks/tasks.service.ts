import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, TaskPriority, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AssignTaskInput } from './dto/assign-task.input.js';
import { ChangeTaskStatusInput } from './dto/change-task-status.input.js';
import { CreateTaskInput } from './dto/create-task.input.js';
import {
  SortDirection,
  TaskQueryInput,
  TaskSortField,
} from './dto/task-query.input.js';
import { UpdateTaskInput } from './dto/update-task.input.js';
import { PaginatedTasks } from './entities/paginated-tasks.entity.js';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

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

  async create(userId: string, input: CreateTaskInput) {
    const { organizationId, projectId } = input;

    const membership = await this.getMembership(userId, organizationId);

    await this.assertProjectActive(organizationId, projectId);

    if (membership.role === Role.EMPLOYEE) {
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
      const assignee = await this.prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId,
            userId: input.assigneeId,
          },
        },
        select: { id: true },
      });

      if (!assignee) {
        throw new BadRequestException(
          'Assignee must be a member of this project',
        );
      }
    }

    if (!input.title.trim()) {
      throw new BadRequestException('Task title cannot be empty');
    }

    if (input.dueDate && Number.isNaN(input.dueDate.getTime())) {
      throw new BadRequestException('Invalid due date');
    }

    return this.prisma.task.create({
      data: {
        organizationId,
        projectId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        priority: input.priority ?? TaskPriority.MEDIUM,
        dueDate: input.dueDate,
        createdById: userId,
        assigneeId: input.assigneeId,
      },
    });
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
      where: { id: taskId, organizationId },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    await this.assertProjectActive(organizationId, task.projectId);

    if (input.title !== undefined && !input.title.trim()) {
      throw new BadRequestException('Task title cannot be empty');
    }

    if (
      input.dueDate instanceof Date &&
      Number.isNaN(input.dueDate.getTime())
    ) {
      throw new BadRequestException('Invalid due date');
    }

    if (input.assigneeId) {
      const assignee = await this.prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId: task.projectId,
            userId: input.assigneeId,
          },
        },
        select: { id: true },
      });

      if (!assignee) {
        throw new BadRequestException(
          'Assignee must be a member of this project',
        );
      }
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

    return this.prisma.task.update({
      where: { id: taskId },
      data,
    });
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
      where: { id: taskId, organizationId },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    await this.assertProjectActive(organizationId, task.projectId);

    if (assigneeId) {
      const assignee = await this.prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId: task.projectId,
            userId: assigneeId,
          },
        },
        select: { id: true },
      });

      if (!assignee) {
        throw new BadRequestException(
          'Assignee must be a member of this project',
        );
      }
    }

    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        assigneeId: assigneeId ?? null,
      },
    });
  }

  async changeStatus(userId: string, input: ChangeTaskStatusInput) {
    const { organizationId, taskId, status } = input;

    const membership = await this.getMembership(userId, organizationId);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, organizationId },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    await this.assertProjectActive(organizationId, task.projectId);

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

    return this.prisma.task.update({
      where: { id: taskId },
      data: { status },
    });
  }

  async get(userId: string, organizationId: string, taskId: string) {
    const membership = await this.getMembership(userId, organizationId);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, organizationId },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
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

    if (membership.role === Role.EMPLOYEE) {
      await this.assertProjectMembership(userId, projectId);
    }

    return this.prisma.task.findMany({
      where: { organizationId, projectId },
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

    if (membership.role === Role.EMPLOYEE) {
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
}