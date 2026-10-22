import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CreateTaskCommentInput } from './dto/create-task-comment.input.js';
import { UpdateTaskCommentInput } from './dto/update-task-comment.input.js';
import { TaskCommentsPaginationInput } from './dto/task-comments-pagination.input.js';
import {
  decodeTaskCommentCursor,
  encodeTaskCommentCursor,
} from './task-comments-cursor.js';

@Injectable()
export class TaskCommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

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
        title: true,
        assigneeId: true,
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

    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.taskComment.create({
        data: {
          organizationId,
          taskId,
          authorId: userId,
          content,
        },
        include: {
          author: {
            select: {
              user: {
                select: {
                  id: true,
                  name: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      });

      if (task.assigneeId && task.assigneeId !== userId) {
        await this.notificationsService.createForRecipient(tx, {
          organizationId,
          recipientId: task.assigneeId,
          taskId,
          type: NotificationType.TASK_COMMENTED,
          message: `New comment on task: ${task.title}`,
        });
      }

      return {
        ...comment,
        author: comment.author.user,
      };
    });
  }

  async findByTask(userId: string, input: TaskCommentsPaginationInput) {
    const { organizationId, taskId, first, after } = input;

    const membership = await this.getMembership(userId, organizationId);
    const task = await this.getTask(organizationId, taskId);

    if (membership.role === Role.EMPLOYEE) {
      await this.assertProjectMembership(userId, task.projectId);
    }

    const cursor = after ? decodeTaskCommentCursor(after) : null;

    const comments = await this.prisma.taskComment.findMany({
      where: {
        organizationId,
        taskId,
        ...(cursor && {
          OR: [
            { createdAt: { gt: new Date(cursor.createdAt) } },
            {
              createdAt: new Date(cursor.createdAt),
              id: { gt: cursor.id },
            },
          ],
        }),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: first + 1,
      include: {
        author: {
          select: {
            user: {
              select: {
                id: true,
                name: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    const hasMore = comments.length > first;
    const pageComments = hasMore ? comments.slice(0, first) : comments;

    const items = pageComments.map((comment) => ({
      ...comment,
      author: comment.author.user,
    }));

    const lastComment = pageComments.at(-1);

    return {
      items,
      nextCursor:
        hasMore && lastComment
          ? encodeTaskCommentCursor({
              createdAt: lastComment.createdAt.toISOString(),
              id: lastComment.id,
            })
          : null,
      hasMore,
    };
  }

  private async getComment(
    organizationId: string,
    taskId: string,
    commentId: string,
  ) {
    const comment = await this.prisma.taskComment.findFirst({
      where: { id: commentId, organizationId, taskId },
      select: {
        id: true,
        organizationId: true,
        taskId: true,
        authorId: true,
        task: {
          select: {
            projectId: true,
            project: { select: { status: true } },
          },
        },
      },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    return comment;
  }

  private async authorizeCommentModification(
    userId: string,
    organizationId: string,
    taskId: string,
    commentId: string,
    action: 'update' | 'delete',
  ) {
    const membership = await this.getMembership(userId, organizationId);
    const comment = await this.getComment(
      organizationId,
      taskId,
      commentId,
    );

    if (comment.task.project.status === 'ARCHIVED') {
      throw new BadRequestException(
        'Cannot modify comments in an archived project',
      );
    }

    // Editing is always restricted to the original author.
    // Admins and managers may delete other users' comments for moderation.
    if (action === 'update' && comment.authorId !== userId) {
      throw new ForbiddenException(
        'You can only modify your own comments',
      );
    }

    if (membership.role === Role.EMPLOYEE) {
      await this.assertProjectMembership(userId, comment.task.projectId);

      if (comment.authorId !== userId) {
        throw new ForbiddenException(
          'You can only modify your own comments',
        );
      }
    }

    return comment;
  }

  async update(userId: string, input: UpdateTaskCommentInput) {
    const { organizationId, taskId, commentId } = input;
    const content = input.content.trim();

    if (!content) {
      throw new BadRequestException('Comment content cannot be empty');
    }

    await this.authorizeCommentModification(
      userId,
      organizationId,
      taskId,
      commentId,
      'update',
    );

    const comment = await this.prisma.taskComment.update({
      where: { id: commentId, organizationId, taskId },
      data: { content },
      include: {
        author: {
          select: {
            user: {
              select: { id: true, name: true, createdAt: true },
            },
          },
        },
      },
    });

    return { ...comment, author: comment.author.user };
  }

  async delete(
    userId: string,
    organizationId: string,
    taskId: string,
    commentId: string,
  ) {
    await this.authorizeCommentModification(
      userId,
      organizationId,
      taskId,
      commentId,
      'delete',
    );

    await this.prisma.taskComment.delete({
      where: { id: commentId, organizationId, taskId },
    });

    return true;
  }

}
