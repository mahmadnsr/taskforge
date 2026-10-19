import { describe, it, expect, vi } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { TaskCommentsService } from './task-comments.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { CreateTaskCommentInput } from './dto/create-task-comment.input.js';

const ORG = 'org-1';
const OTHER_ORG = 'org-2';
const USER = 'user-1';
const TASK = 'task-1';
const PROJECT = 'project-1';

function setup(role: Role | null = Role.ADMIN) {
  const prisma = {
    organizationMember: {
      findUnique: vi.fn().mockResolvedValue(
        role ? { userId: USER, organizationId: ORG, role } : null,
      ),
    },
    task: {
      findFirst: vi.fn().mockResolvedValue({
        id: TASK,
        organizationId: ORG,
        projectId: PROJECT,
        project: { status: 'ACTIVE' },
      }),
    },
    projectMember: {
      findUnique: vi.fn().mockResolvedValue({ id: 'project-member-1' }),
    },
    taskComment: {
      create: vi.fn().mockImplementation(async ({ data }) => ({
        id: 'comment-1',
        ...data,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      })),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };

  const service = new TaskCommentsService(
    prisma as unknown as PrismaService,
  );

  return { service, prisma };
}

const input = {
  organizationId: ORG,
  taskId: TASK,
  content: 'A useful comment',
} satisfies CreateTaskCommentInput;

describe('TaskCommentsService', () => {
  describe('create', () => {
    it('creates a comment with trimmed content and the authenticated author', async () => {
      const { service, prisma } = setup();

      await service.create(USER, {
        ...input,
        content: '  A useful comment  ',
      });

      expect(prisma.taskComment.create).toHaveBeenCalledWith({
        data: {
          organizationId: ORG,
          taskId: TASK,
          authorId: USER,
          content: 'A useful comment',
        },
      });
    });

    it('rejects whitespace-only content', async () => {
      const { service, prisma } = setup();

      await expect(
        service.create(USER, { ...input, content: '   \n\t  ' }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.organizationMember.findUnique).not.toHaveBeenCalled();
      expect(prisma.taskComment.create).not.toHaveBeenCalled();
    });

    it('rejects a user who is not an organization member', async () => {
      const { service, prisma } = setup(null);

      await expect(service.create(USER, input)).rejects.toThrow(
        ForbiddenException,
      );

      expect(prisma.task.findFirst).not.toHaveBeenCalled();
      expect(prisma.taskComment.create).not.toHaveBeenCalled();
    });

    it('scopes task lookup to the requested organization', async () => {
      const { service, prisma } = setup();

      await service.create(USER, {
        ...input,
        organizationId: OTHER_ORG,
      });

      expect(prisma.task.findFirst).toHaveBeenCalledWith({
        where: { id: TASK, organizationId: OTHER_ORG },
        select: {
          id: true,
          organizationId: true,
          projectId: true,
          project: { select: { status: true } },
        },
      });
    });

    it('rejects a task that does not exist in the organization', async () => {
      const { service, prisma } = setup();
      prisma.task.findFirst.mockResolvedValue(null);

      await expect(service.create(USER, input)).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.taskComment.create).not.toHaveBeenCalled();
    });

    it('rejects comments on archived projects', async () => {
      const { service, prisma } = setup();
      prisma.task.findFirst.mockResolvedValue({
        id: TASK,
        organizationId: ORG,
        projectId: PROJECT,
        project: { status: 'ARCHIVED' },
      });

      await expect(service.create(USER, input)).rejects.toThrow(
        'Cannot add comments to an archived project',
      );

      expect(prisma.taskComment.create).not.toHaveBeenCalled();
    });

    it('rejects an EMPLOYEE who is not a project member', async () => {
      const { service, prisma } = setup(Role.EMPLOYEE);
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(service.create(USER, input)).rejects.toThrow(
        'You must be a project member to access task comments',
      );

      expect(prisma.taskComment.create).not.toHaveBeenCalled();
    });

    it('allows an EMPLOYEE who belongs to the project', async () => {
      const { service, prisma } = setup(Role.EMPLOYEE);

      await service.create(USER, input);

      expect(prisma.projectMember.findUnique).toHaveBeenCalledWith({
        where: {
          projectId_userId: { projectId: PROJECT, userId: USER },
        },
        select: { id: true },
      });
      expect(prisma.taskComment.create).toHaveBeenCalled();
    });

    it('allows a MANAGER without requiring project membership', async () => {
      const { service, prisma } = setup(Role.MANAGER);

      await service.create(USER, input);

      expect(prisma.taskComment.create).toHaveBeenCalled();
      expect(prisma.projectMember.findUnique).not.toHaveBeenCalled();
    });

    it('allows an ADMIN without requiring project membership', async () => {
      const { service, prisma } = setup(Role.ADMIN);

      await service.create(USER, input);

      expect(prisma.taskComment.create).toHaveBeenCalled();
      expect(prisma.projectMember.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('findByTask', () => {
    it('returns comments scoped to the organization and task in chronological order', async () => {
      const { service, prisma } = setup();
      const comments = [
        { id: 'comment-1', content: 'First' },
        { id: 'comment-2', content: 'Second' },
      ];
      prisma.taskComment.findMany.mockResolvedValue(comments);

      await expect(service.findByTask(USER, ORG, TASK)).resolves.toEqual(
        comments,
      );

      expect(prisma.taskComment.findMany).toHaveBeenCalledWith({
        where: { organizationId: ORG, taskId: TASK },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
    });

    it('rejects a user who is not an organization member', async () => {
      const { service, prisma } = setup(null);

      await expect(service.findByTask(USER, ORG, TASK)).rejects.toThrow(
        ForbiddenException,
      );

      expect(prisma.taskComment.findMany).not.toHaveBeenCalled();
    });

    it('rejects a task that does not exist in the organization', async () => {
      const { service, prisma } = setup();
      prisma.task.findFirst.mockResolvedValue(null);

      await expect(service.findByTask(USER, ORG, TASK)).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.taskComment.findMany).not.toHaveBeenCalled();
    });

    it('rejects an EMPLOYEE who is not a project member', async () => {
      const { service, prisma } = setup(Role.EMPLOYEE);
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(service.findByTask(USER, ORG, TASK)).rejects.toThrow(
        'You must be a project member to access task comments',
      );

      expect(prisma.taskComment.findMany).not.toHaveBeenCalled();
    });

    it('allows an EMPLOYEE who belongs to the project', async () => {
      const { service, prisma } = setup(Role.EMPLOYEE);

      await service.findByTask(USER, ORG, TASK);

      expect(prisma.taskComment.findMany).toHaveBeenCalled();
    });

    it('allows listing comments for a MANAGER without project membership', async () => {
      const { service, prisma } = setup(Role.MANAGER);

      await service.findByTask(USER, ORG, TASK);

      expect(prisma.taskComment.findMany).toHaveBeenCalled();
      expect(prisma.projectMember.findUnique).not.toHaveBeenCalled();
    });
  });
});
