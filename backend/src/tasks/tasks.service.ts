import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, TaskPriority, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateTaskInput } from './dto/create-task.input.js';
import { UpdateTaskInput } from './dto/update-task.input.js';
import { ChangeTaskStatusInput } from './dto/change-task-status.input.js';

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

  async create(userId: string, input: CreateTaskInput) {
    const { organizationId, projectId } = input;

    const membership = await this.getMembership(userId, organizationId);
    await this.getProject(organizationId, projectId);

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

    if (input.title !== undefined) data.title = input.title.trim();
    if (input.description !== undefined) {
      data.description = input.description?.trim() || null;
    }
    if (input.priority !== undefined) data.priority = input.priority;
    if (input.assigneeId !== undefined) {
      data.assigneeId = input.assigneeId;
    }
    if (input.dueDate !== undefined) data.dueDate = input.dueDate;

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Provide at least one field to update');
    }

    return this.prisma.task.update({
      where: { id: taskId },
      data,
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

    if (
      membership.role === Role.EMPLOYEE
    ) {
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

    return this.prisma.task.findMany({
      where: { organizationId, projectId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
