import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateTaskCommentInput } from './dto/create-task-comment.input.js';

@Injectable()
export class TaskCommentsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getMembership(userId: string, organizationId: string) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: { userId, organizationId },
      },
      select: {
        userId: true,
        organizationId: true,
        role: true,
      },
    });

    if (!membership) {
      throw new ForbiddenException(
        'You are not a member of this organization',
      );
    }

    return membership;
  }

  private async getTask(organizationId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, organizationId },
      select: {
        id: true,
        organizationId: true,
        projectId: true,
        project: {
          select: { status: true },
        },
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return task;
  }

  private async assertProjectMembership(userId: string, projectId: string) {
    const projectMembership = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId, userId },
      },
      select: { id: true },
    });

    if (!projectMembership) {
      throw new ForbiddenException(
        'You must be a project member to access task comments',
      );
    }
  }

  async create(userId: string, input: CreateTaskCommentInput) {
    const { organizationId, taskId } = input;
    const content = input.content.trim();

    if (!content) {
      throw new BadRequestException('Comment content cannot be empty');
    }

    const membership = await this.getMembership(userId, organizationId);
    const task = await this.getTask(organizationId, taskId);

    if (task.project.status === 'ARCHIVED') {
      throw new BadRequestException(
        'Cannot add comments to an archived project',
      );
    }

    if (membership.role === Role.EMPLOYEE) {
      await this.assertProjectMembership(userId, task.projectId);
    }

    return this.prisma.taskComment.create({
      data: {
        organizationId,
        taskId,
        authorId: userId,
        content,
      },
    });
  }

  async findByTask(userId: string, organizationId: string, taskId: string) {
    const membership = await this.getMembership(userId, organizationId);
    const task = await this.getTask(organizationId, taskId);

    if (membership.role === Role.EMPLOYEE) {
      await this.assertProjectMembership(userId, task.projectId);
    }

    return this.prisma.taskComment.findMany({
      where: { organizationId, taskId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }
}
