import { describe, it, expect, vi } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  SortDirection,
  TaskQueryInput,
  TaskSortField,
} from './dto/task-query.input.js';
import { Role, TaskPriority, TaskStatus } from '@prisma/client';
import { TasksService } from './tasks.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { CreateTaskInput } from './dto/create-task.input.js';
import type { UpdateTaskInput } from './dto/update-task.input.js';
import type { ChangeTaskStatusInput } from './dto/change-task-status.input.js';
import type { AssignTaskInput } from './dto/assign-task.input.js';

const ORG = 'org-1';
const OTHER_ORG = 'org-2';
const USER = 'user-1';
const PROJECT = 'project-1';
const ASSIGNEE = 'assignee-1';
const TASK = 'task-1';

function setup(role: Role | null = Role.ADMIN) {
  const prisma = {
    organizationMember: {
      findUnique: vi.fn().mockResolvedValue(
        role
          ? { userId: USER, organizationId: ORG, role }
          : null,
      ),
    },
    project: {
      findUnique: vi.fn().mockResolvedValue({
        id: PROJECT,
        organizationId: ORG,
        status: 'ACTIVE',
      }),
    },
    projectMember: {
      findUnique: vi.fn().mockResolvedValue({ id: 'membership-1' }),
    },
    task: {
      create: vi.fn().mockImplementation(async ({ data }) => ({
        id: TASK,
        ...data,
      })),
      findFirst: vi.fn().mockResolvedValue({
        id: TASK,
        organizationId: ORG,
        projectId: PROJECT,
        title: 'Prepare report',
        status: TaskStatus.TODO,
        assigneeId: ASSIGNEE,
      }),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn().mockImplementation(async ({ where, data }) => ({
        id: where.id,
        organizationId: ORG,
        projectId: PROJECT,
        ...data,
      })),
    },
  };

  const service = new TasksService(
    prisma as unknown as PrismaService,
  );

  return { service, prisma };
}

const input = {
  organizationId: ORG,
  projectId: PROJECT,
  title: 'Prepare report',
} satisfies CreateTaskInput;

describe('TasksService', () => {
  describe('create', () => {
    it('creates a task with trimmed fields and default priority', async () => {
      const { service, prisma } = setup();

      await service.create(USER, {
        ...input,
        title: '  Prepare report  ',
        description: '  Monthly report  ',
      });

      expect(prisma.task.create).toHaveBeenCalledWith({
        data: {
          organizationId: ORG,
          projectId: PROJECT,
          title: 'Prepare report',
          description: 'Monthly report',
          priority: TaskPriority.MEDIUM,
          dueDate: undefined,
          createdById: USER,
          assigneeId: undefined,
        },
      });
    });

    it('uses the supplied priority and due date', async () => {
      const { service, prisma } = setup();
      const dueDate = new Date('2027-01-15T00:00:00.000Z');

      await service.create(USER, {
        ...input,
        priority: TaskPriority.HIGH,
        dueDate,
      });

      expect(prisma.task.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          priority: TaskPriority.HIGH,
          dueDate,
        }),
      });
    });

    it('rejects a user who is not an organization member', async () => {
      const { service, prisma } = setup(null);

      await expect(
        service.create(USER, input),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.project.findUnique).not.toHaveBeenCalled();
      expect(prisma.task.create).not.toHaveBeenCalled();
    });

    it('rejects a project that does not belong to the organization', async () => {
      const { service, prisma } = setup();
      prisma.project.findUnique.mockResolvedValue(null);

      await expect(
        service.create(USER, input),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.project.findUnique).toHaveBeenCalledWith({
        where: {
          id_organizationId: {
            id: PROJECT,
            organizationId: ORG,
          },
        },
        select: {
          id: true,
          organizationId: true,
          status: true,
        },
      });

      expect(prisma.task.create).not.toHaveBeenCalled();
    });

    it('rejects creating a task in an archived project', async () => {
      const { service, prisma } = setup();

      prisma.project.findUnique.mockResolvedValue({
        id: PROJECT,
        organizationId: ORG,
        status: 'ARCHIVED',
      });

      await expect(
        service.create(USER, input),
      ).rejects.toThrow(
        'Cannot modify tasks in an archived project',
      );

      expect(prisma.task.create).not.toHaveBeenCalled();
    });

    it('rejects an EMPLOYEE who is not a project member', async () => {
      const { service, prisma } = setup(Role.EMPLOYEE);
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        service.create(USER, input),
      ).rejects.toThrow(
        'You must be a project member to create tasks',
      );

      expect(prisma.task.create).not.toHaveBeenCalled();
    });

    it('allows an EMPLOYEE who belongs to the project', async () => {
      const { service, prisma } = setup(Role.EMPLOYEE);

      await service.create(USER, input);

      expect(prisma.task.create).toHaveBeenCalled();
    });

    it('allows a MANAGER to create a task', async () => {
      const { service, prisma } = setup(Role.MANAGER);

      await service.create(USER, input);

      expect(prisma.task.create).toHaveBeenCalled();
      expect(prisma.projectMember.findUnique).not.toHaveBeenCalled();
    });

    it('rejects an assignee who is not a project member', async () => {
      const { service, prisma } = setup();
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        service.create(USER, {
          ...input,
          assigneeId: ASSIGNEE,
        }),
      ).rejects.toThrow(
        'Assignee must be a member of this project',
      );

      expect(prisma.task.create).not.toHaveBeenCalled();
    });

    it('accepts an assignee who belongs to the project', async () => {
      const { service, prisma } = setup();

      await service.create(USER, {
        ...input,
        assigneeId: ASSIGNEE,
      });

      expect(prisma.task.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          assigneeId: ASSIGNEE,
          createdById: USER,
        }),
      });
    });

    it('rejects a blank title', async () => {
      const { service, prisma } = setup();

      await expect(
        service.create(USER, {
          ...input,
          title: '   ',
        }),
      ).rejects.toThrow('Task title cannot be empty');

      expect(prisma.task.create).not.toHaveBeenCalled();
    });

    it('rejects an invalid due date', async () => {
      const { service, prisma } = setup();

      await expect(
        service.create(USER, {
          ...input,
          dueDate: new Date(Number.NaN),
        }),
      ).rejects.toThrow('Invalid due date');

      expect(prisma.task.create).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('rejects a user who is not an organization member', async () => {
      const { service, prisma } = setup(null);

      await expect(
        service.get(USER, ORG, TASK),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.task.findFirst).not.toHaveBeenCalled();
    });

    it('returns a task scoped to the organization', async () => {
      const { service, prisma } = setup();

      await expect(
        service.get(USER, ORG, TASK),
      ).resolves.toEqual({
        id: TASK,
        organizationId: ORG,
        projectId: PROJECT,
        title: 'Prepare report',
        status: TaskStatus.TODO,
        assigneeId: ASSIGNEE,
      });

      expect(prisma.task.findFirst).toHaveBeenCalledWith({
        where: {
          id: TASK,
          organizationId: ORG,
        },
      });
    });

    it('allows reading a task in an archived project', async () => {
      const { service, prisma } = setup();

      prisma.project.findUnique.mockResolvedValue({
        id: PROJECT,
        organizationId: ORG,
        status: 'ARCHIVED',
      });

      await expect(
        service.get(USER, ORG, TASK),
      ).resolves.toEqual(
        expect.objectContaining({
          id: TASK,
          projectId: PROJECT,
        }),
      );
    });

    it('throws NotFoundException when the task is absent from the organization', async () => {
      const { service, prisma } = setup();
      prisma.task.findFirst.mockResolvedValue(null);

      await expect(
        service.get(USER, ORG, TASK),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects an EMPLOYEE who is not a project member', async () => {
      const { service, prisma } = setup(Role.EMPLOYEE);
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        service.get(USER, ORG, TASK),
      ).rejects.toThrow(
        'You must be a project member to view this task',
      );

      expect(prisma.projectMember.findUnique).toHaveBeenCalledWith({
        where: {
          projectId_userId: {
            projectId: PROJECT,
            userId: USER,
          },
        },
        select: { id: true },
      });
    });

    it('allows an EMPLOYEE who belongs to the project to view a task', async () => {
      const { service, prisma } = setup(Role.EMPLOYEE);

      await service.get(USER, ORG, TASK);

      expect(prisma.task.findFirst).toHaveBeenCalled();
      expect(prisma.projectMember.findUnique).toHaveBeenCalled();
    });

    it('does not return a task belonging to another organization', async () => {
      const { service, prisma } = setup();
      prisma.task.findFirst.mockResolvedValue(null);

      await expect(
        service.get(USER, OTHER_ORG, TASK),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.task.findFirst).toHaveBeenCalledWith({
        where: {
          id: TASK,
          organizationId: OTHER_ORG,
        },
      });
    });
  });

  describe('listByProject', () => {
    it('rejects a user who is not an organization member', async () => {
      const { service, prisma } = setup(null);

      await expect(
        service.listByProject(USER, ORG, PROJECT),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.task.findMany).not.toHaveBeenCalled();
    });

    it('rejects a project outside the organization', async () => {
      const { service, prisma } = setup();
      prisma.project.findUnique.mockResolvedValue(null);

      await expect(
        service.listByProject(USER, ORG, PROJECT),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.task.findMany).not.toHaveBeenCalled();
    });

    it('rejects an EMPLOYEE who is not a project member', async () => {
      const { service, prisma } = setup(Role.EMPLOYEE);
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        service.listByProject(USER, ORG, PROJECT),
      ).rejects.toThrow(
        'You must be a project member to view project tasks',
      );

      expect(prisma.task.findMany).not.toHaveBeenCalled();
    });

    it('lists tasks scoped to the organization and project, newest first', async () => {
      const { service, prisma } = setup();

      await service.listByProject(USER, ORG, PROJECT);

      expect(prisma.task.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: ORG,
          projectId: PROJECT,
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('allows listing tasks in an archived project', async () => {
      const { service, prisma } = setup();

      prisma.project.findUnique.mockResolvedValue({
        id: PROJECT,
        organizationId: ORG,
        status: 'ARCHIVED',
      });

      await service.listByProject(USER, ORG, PROJECT);

      expect(prisma.task.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: ORG,
          projectId: PROJECT,
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('returns the result from Prisma', async () => {
      const { service, prisma } = setup();
      const tasks = [{ id: TASK, title: 'Prepare report' }];

      prisma.task.findMany.mockResolvedValue(tasks);

      await expect(
        service.listByProject(USER, ORG, PROJECT),
      ).resolves.toEqual(tasks);
    });

    it('allows an EMPLOYEE who belongs to the project to list tasks', async () => {
      const { service, prisma } = setup(Role.EMPLOYEE);

      await service.listByProject(USER, ORG, PROJECT);

      expect(prisma.projectMember.findUnique).toHaveBeenCalled();
      expect(prisma.task.findMany).toHaveBeenCalled();
    });

    it('allows a MANAGER to list project tasks', async () => {
      const { service, prisma } = setup(Role.MANAGER);

      await service.listByProject(USER, ORG, PROJECT);

      expect(prisma.task.findMany).toHaveBeenCalled();
      expect(prisma.projectMember.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('searchProjectTasks', () => {
    it('uses default pagination and sorting', async () => {
      const { service, prisma } = setup();

      prisma.task.findMany.mockResolvedValue([
        { id: TASK, title: 'Prepare report' },
      ]);
      prisma.task.count.mockResolvedValue(1);

      await expect(
        service.searchProjectTasks(USER, ORG, PROJECT),
      ).resolves.toEqual({
        tasks: [{ id: TASK, title: 'Prepare report' }],
        totalCount: 1,
        hasNextPage: false,
        limit: 20,
        offset: 0,
      });

      expect(prisma.task.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: ORG,
          projectId: PROJECT,
        },
        orderBy: [
          { createdAt: SortDirection.DESC },
          { id: 'asc' },
        ],
        take: 20,
        skip: 0,
      });

      expect(prisma.task.count).toHaveBeenCalledWith({
        where: {
          organizationId: ORG,
          projectId: PROJECT,
        },
      });
    });

    it('applies filters, search, custom pagination and sorting', async () => {
      const { service, prisma } = setup();

      const filters: TaskQueryInput = {
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.HIGH,
        assigneeId: ASSIGNEE,
        search: '  Report  ',
        sortBy: TaskSortField.UPDATED_AT,
        sortDirection: SortDirection.ASC,
        limit: 10,
        offset: 5,
      };

      await service.searchProjectTasks(
        USER,
        ORG,
        PROJECT,
        filters,
      );

      const expectedWhere = {
        organizationId: ORG,
        projectId: PROJECT,
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.HIGH,
        assigneeId: ASSIGNEE,
        OR: [
          {
            title: {
              contains: 'Report',
              mode: 'insensitive',
            },
          },
          {
            description: {
              contains: 'Report',
              mode: 'insensitive',
            },
          },
        ],
      };

      expect(prisma.task.findMany).toHaveBeenCalledWith({
        where: expectedWhere,
        orderBy: [
          { updatedAt: SortDirection.ASC },
          { id: 'asc' },
        ],
        take: 10,
        skip: 5,
      });

      expect(prisma.task.count).toHaveBeenCalledWith({
        where: expectedWhere,
      });
    });

    it('calculates hasNextPage when more results exist', async () => {
      const { service, prisma } = setup();

      prisma.task.findMany.mockResolvedValue([
        { id: 'task-2' },
        { id: 'task-3' },
      ]);
      prisma.task.count.mockResolvedValue(10);

      await expect(
        service.searchProjectTasks(USER, ORG, PROJECT, {
          limit: 2,
          offset: 2,
        }),
      ).resolves.toMatchObject({
        totalCount: 10,
        hasNextPage: true,
        limit: 2,
        offset: 2,
      });
    });

    it('returns an empty page when offset exceeds totalCount', async () => {
      const { service, prisma } = setup();
      prisma.task.findMany.mockResolvedValue([]);
      prisma.task.count.mockResolvedValue(5);

      await expect(service.searchProjectTasks(USER, ORG, PROJECT, {
        limit: 10,
        offset: 10,
      })).resolves.toMatchObject({
        tasks: [],
        totalCount: 5,
        hasNextPage: false,
        limit: 10,
        offset: 10,
      });
    });

    it('sets hasNextPage to false on the last page', async () => {
      const { service, prisma } = setup();
      prisma.task.findMany.mockResolvedValue([
        { id: 'task-4' },
        { id: 'task-5' },
      ]);
      prisma.task.count.mockResolvedValue(5);

      await expect(service.searchProjectTasks(USER, ORG, PROJECT, {
        limit: 2,
        offset: 3,
      })).resolves.toMatchObject({
        totalCount: 5,
        hasNextPage: false,
        limit: 2,
        offset: 3,
      });
    });

    it('ignores whitespace-only search', async () => {
      const { service, prisma } = setup();

      await service.searchProjectTasks(USER, ORG, PROJECT, {
        search: '   ',
      });

      expect(prisma.task.findMany.mock.calls[0][0].where).not.toHaveProperty('OR');
      expect(prisma.task.count.mock.calls[0][0].where).not.toHaveProperty('OR');
    });

    it('uses identical filters for task fetching and counting', async () => {
      const { service, prisma } = setup();

      await service.searchProjectTasks(USER, ORG, PROJECT, {
        status: TaskStatus.TODO,
        priority: TaskPriority.HIGH,
        assigneeId: ASSIGNEE,
        search: 'report',
      });

      expect(prisma.task.count.mock.calls[0][0].where).toEqual(
        prisma.task.findMany.mock.calls[0][0].where,
      );
    });

    it('rejects a user who is not an organization member', async () => {
      const { service, prisma } = setup(null);

      await expect(
        service.searchProjectTasks(USER, ORG, PROJECT),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.task.findMany).not.toHaveBeenCalled();
      expect(prisma.task.count).not.toHaveBeenCalled();
    });

    it('rejects an EMPLOYEE who is not a project member', async () => {
      const { service, prisma } = setup(Role.EMPLOYEE);
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        service.searchProjectTasks(USER, ORG, PROJECT),
      ).rejects.toThrow(
        'You must be a project member to view project tasks',
      );

      expect(prisma.task.findMany).not.toHaveBeenCalled();
      expect(prisma.task.count).not.toHaveBeenCalled();
    });

    it.each([0, -1, 101, 1.5, NaN])(
      'rejects invalid limit: %s',
      async (limit) => {
        const { service, prisma } = setup();

        await expect(
          service.searchProjectTasks(USER, ORG, PROJECT, {
            limit,
          }),
        ).rejects.toThrow(BadRequestException);

        expect(prisma.task.findMany).not.toHaveBeenCalled();
        expect(prisma.task.count).not.toHaveBeenCalled();
      },
    );

    it.each([-1, 1.5, NaN])(
      'rejects invalid offset: %s',
      async (offset) => {
        const { service, prisma } = setup();

        await expect(
          service.searchProjectTasks(USER, ORG, PROJECT, {
            offset,
          }),
        ).rejects.toThrow(BadRequestException);

        expect(prisma.task.findMany).not.toHaveBeenCalled();
        expect(prisma.task.count).not.toHaveBeenCalled();
      },
    );

    it('rejects an invalid sort field', async () => {
      const { service, prisma } = setup();

      await expect(
        service.searchProjectTasks(USER, ORG, PROJECT, {
          sortBy: 'invalid' as TaskSortField,
        }),
      ).rejects.toThrow('Invalid task sort field');

      expect(prisma.task.findMany).not.toHaveBeenCalled();
    });

    it('rejects an invalid sort direction', async () => {
      const { service, prisma } = setup();

      await expect(
        service.searchProjectTasks(USER, ORG, PROJECT, {
          sortDirection: 'invalid' as SortDirection,
        }),
      ).rejects.toThrow('Invalid sort direction');

      expect(prisma.task.findMany).not.toHaveBeenCalled();
    });

    it('allows a MANAGER without project membership lookup', async () => {
      const { service, prisma } = setup(Role.MANAGER);

      await service.searchProjectTasks(USER, ORG, PROJECT);

      expect(prisma.task.findMany).toHaveBeenCalled();
      expect(prisma.task.count).toHaveBeenCalled();
      expect(prisma.projectMember.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const updateInput = {
      organizationId: ORG,
      taskId: TASK,
      title: '  Updated report  ',
    } satisfies UpdateTaskInput;

    it('updates fields and trims the title', async () => {
      const { service, prisma } = setup();

      await service.update(USER, updateInput);

      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: TASK },
        data: { title: 'Updated report' },
      });
    });

    it('rejects updating a task in an archived project', async () => {
      const { service, prisma } = setup();

      prisma.project.findUnique.mockResolvedValue({
        id: PROJECT,
        organizationId: ORG,
        status: 'ARCHIVED',
      });

      await expect(
        service.update(USER, updateInput),
      ).rejects.toThrow(
        'Cannot modify tasks in an archived project',
      );

      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('allows clearing nullable fields', async () => {
      const { service, prisma } = setup();

      await service.update(USER, {
        organizationId: ORG,
        taskId: TASK,
        description: null,
        assigneeId: null,
        dueDate: null,
      });

      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: TASK },
        data: {
          description: null,
          assigneeId: null,
          dueDate: null,
        },
      });
    });

    it('allows a MANAGER to update task details', async () => {
      const { service, prisma } = setup(Role.MANAGER);

      await service.update(USER, updateInput);

      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: TASK },
        data: { title: 'Updated report' },
      });
    });

    it('rejects EMPLOYEE task-detail updates', async () => {
      const { service, prisma } = setup(Role.EMPLOYEE);

      await expect(
        service.update(USER, updateInput),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.task.findFirst).not.toHaveBeenCalled();
      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('rejects a task not found in the organization', async () => {
      const { service, prisma } = setup();
      prisma.task.findFirst.mockResolvedValue(null);

      await expect(
        service.update(USER, updateInput),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('does not update a task belonging to another organization', async () => {
      const { service, prisma } = setup();
      prisma.task.findFirst.mockResolvedValue(null);

      await expect(
        service.update(USER, {
          ...updateInput,
          organizationId: OTHER_ORG,
        }),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.task.findFirst).toHaveBeenCalledWith({
        where: {
          id: TASK,
          organizationId: OTHER_ORG,
        },
      });

      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('rejects an empty update', async () => {
      const { service, prisma } = setup();

      await expect(
        service.update(USER, {
          organizationId: ORG,
          taskId: TASK,
        }),
      ).rejects.toThrow('Provide at least one field to update');

      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('rejects a blank title', async () => {
      const { service, prisma } = setup();

      await expect(
        service.update(USER, {
          ...updateInput,
          title: '   ',
        }),
      ).rejects.toThrow('Task title cannot be empty');

      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('rejects an invalid due date', async () => {
      const { service, prisma } = setup();

      await expect(
        service.update(USER, {
          organizationId: ORG,
          taskId: TASK,
          dueDate: new Date(Number.NaN),
        }),
      ).rejects.toThrow('Invalid due date');

      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('rejects an assignee who is not a project member', async () => {
      const { service, prisma } = setup();
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        service.update(USER, {
          organizationId: ORG,
          taskId: TASK,
          assigneeId: ASSIGNEE,
        }),
      ).rejects.toThrow(
        'Assignee must be a member of this project',
      );

      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('accepts an assignee who belongs to the project', async () => {
      const { service, prisma } = setup();

      await service.update(USER, {
        organizationId: ORG,
        taskId: TASK,
        assigneeId: ASSIGNEE,
      });

      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: TASK },
        data: { assigneeId: ASSIGNEE },
      });
    });
  });

  describe('assign', () => {
    const assignInput = {
      organizationId: ORG,
      taskId: TASK,
      assigneeId: ASSIGNEE,
    } satisfies AssignTaskInput;

    it('allows an ADMIN to assign a task', async () => {
      const { service, prisma } = setup(Role.ADMIN);

      await service.assign(USER, assignInput);

      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: TASK },
        data: { assigneeId: ASSIGNEE },
      });
    });

    it('allows a MANAGER to assign a task', async () => {
      const { service, prisma } = setup(Role.MANAGER);

      await service.assign(USER, assignInput);

      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: TASK },
        data: { assigneeId: ASSIGNEE },
      });
    });

    it('rejects an EMPLOYEE attempting to assign a task', async () => {
      const { service, prisma } = setup(Role.EMPLOYEE);

      await expect(
        service.assign(USER, assignInput),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('rejects a user who is not an organization member', async () => {
      const { service, prisma } = setup(null);

      await expect(
        service.assign(USER, assignInput),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('rejects assigning a task that does not exist in the organization', async () => {
      const { service, prisma } = setup();
      prisma.task.findFirst.mockResolvedValue(null);

      await expect(
        service.assign(USER, assignInput),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('rejects an assignee who is not a member of the project', async () => {
      const { service, prisma } = setup();
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        service.assign(USER, assignInput),
      ).rejects.toThrow(
        'Assignee must be a member of this project',
      );

      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('rejects assignment in an archived project', async () => {
      const { service, prisma } = setup();

      prisma.project.findUnique.mockResolvedValue({
        id: PROJECT,
        organizationId: ORG,
        status: 'ARCHIVED',
      });

      await expect(
        service.assign(USER, assignInput),
      ).rejects.toThrow(
        'Cannot modify tasks in an archived project',
      );

      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('allows unassigning a task with explicit null', async () => {
      const { service, prisma } = setup();

      await service.assign(USER, {
        ...assignInput,
        assigneeId: null,
      });

      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: TASK },
        data: { assigneeId: null },
      });

      expect(prisma.projectMember.findUnique).not.toHaveBeenCalled();
    });

    it('rejects an omitted assigneeId', async () => {
      const { service, prisma } = setup();

      const incompleteInput = {
        organizationId: ORG,
        taskId: TASK,
      };

      await expect(
        service.assign(
          USER,
          incompleteInput as AssignTaskInput,
        ),
      ).rejects.toThrow(
        'Provide assigneeId or null to unassign the task',
      );

      expect(prisma.task.update).not.toHaveBeenCalled();
    });
  });

  describe('changeStatus', () => {
    const statusInput = {
      organizationId: ORG,
      taskId: TASK,
      status: TaskStatus.IN_PROGRESS,
    } satisfies ChangeTaskStatusInput;

    it('allows TODO to IN_PROGRESS', async () => {
      const { service, prisma } = setup();

      await service.changeStatus(USER, statusInput);

      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: TASK },
        data: { status: TaskStatus.IN_PROGRESS },
      });
    });

    it('rejects changing task status in an archived project', async () => {
      const { service, prisma } = setup();

      prisma.project.findUnique.mockResolvedValue({
        id: PROJECT,
        organizationId: ORG,
        status: 'ARCHIVED',
      });

      await expect(
        service.changeStatus(USER, statusInput),
      ).rejects.toThrow(
        'Cannot modify tasks in an archived project',
      );

      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('allows IN_PROGRESS to IN_REVIEW', async () => {
      const { service, prisma } = setup();

      prisma.task.findFirst.mockResolvedValue({
        id: TASK,
        organizationId: ORG,
        projectId: PROJECT,
        status: TaskStatus.IN_PROGRESS,
        assigneeId: ASSIGNEE,
      });

      await service.changeStatus(USER, {
        ...statusInput,
        status: TaskStatus.IN_REVIEW,
      });

      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: TASK },
        data: { status: TaskStatus.IN_REVIEW },
      });
    });

    it('allows IN_REVIEW to IN_PROGRESS', async () => {
      const { service, prisma } = setup();

      prisma.task.findFirst.mockResolvedValue({
        id: TASK,
        organizationId: ORG,
        projectId: PROJECT,
        status: TaskStatus.IN_REVIEW,
        assigneeId: ASSIGNEE,
      });

      await service.changeStatus(USER, {
        ...statusInput,
        status: TaskStatus.IN_PROGRESS,
      });

      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: TASK },
        data: { status: TaskStatus.IN_PROGRESS },
      });
    });

    it('allows IN_REVIEW to DONE', async () => {
      const { service, prisma } = setup();

      prisma.task.findFirst.mockResolvedValue({
        id: TASK,
        organizationId: ORG,
        projectId: PROJECT,
        status: TaskStatus.IN_REVIEW,
        assigneeId: ASSIGNEE,
      });

      await service.changeStatus(USER, {
        ...statusInput,
        status: TaskStatus.DONE,
      });

      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: TASK },
        data: { status: TaskStatus.DONE },
      });
    });

    it('rejects TODO directly to DONE', async () => {
      const { service, prisma } = setup();

      await expect(
        service.changeStatus(USER, {
          ...statusInput,
          status: TaskStatus.DONE,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('rejects IN_PROGRESS directly to DONE', async () => {
      const { service, prisma } = setup();

      prisma.task.findFirst.mockResolvedValue({
        id: TASK,
        organizationId: ORG,
        projectId: PROJECT,
        status: TaskStatus.IN_PROGRESS,
        assigneeId: ASSIGNEE,
      });

      await expect(
        service.changeStatus(USER, {
          ...statusInput,
          status: TaskStatus.DONE,
        }),
      ).rejects.toThrow('Invalid task status transition');

      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('rejects any transition from DONE', async () => {
      const { service, prisma } = setup();

      prisma.task.findFirst.mockResolvedValue({
        id: TASK,
        organizationId: ORG,
        projectId: PROJECT,
        status: TaskStatus.DONE,
        assigneeId: ASSIGNEE,
      });

      await expect(
        service.changeStatus(USER, statusInput),
      ).rejects.toThrow('Invalid task status transition');

      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('rejects a missing task', async () => {
      const { service, prisma } = setup();
      prisma.task.findFirst.mockResolvedValue(null);

      await expect(
        service.changeStatus(USER, statusInput),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('rejects a user who is not an organization member', async () => {
      const { service, prisma } = setup(null);

      await expect(
        service.changeStatus(USER, statusInput),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.task.findFirst).not.toHaveBeenCalled();
    });

    it('rejects an EMPLOYEE who is not a project member', async () => {
      const { service, prisma } = setup(Role.EMPLOYEE);
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        service.changeStatus(USER, statusInput),
      ).rejects.toThrow(
        'You must be a project member to change task status',
      );

      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('rejects an EMPLOYEE who is not assigned to the task', async () => {
      const { service, prisma } = setup(Role.EMPLOYEE);

      await expect(
        service.changeStatus(USER, statusInput),
      ).rejects.toThrow(
        'You can only change the status of tasks assigned to you',
      );

      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('allows an assigned EMPLOYEE to advance the task', async () => {
      const { service, prisma } = setup(Role.EMPLOYEE);

      prisma.task.findFirst.mockResolvedValue({
        id: TASK,
        organizationId: ORG,
        projectId: PROJECT,
        title: 'Prepare report',
        status: TaskStatus.TODO,
        assigneeId: USER,
      });

      await service.changeStatus(USER, statusInput);

      expect(prisma.projectMember.findUnique).toHaveBeenCalled();

      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: TASK },
        data: { status: TaskStatus.IN_PROGRESS },
      });
    });

    it('allows a MANAGER to change task status', async () => {
      const { service, prisma } = setup(Role.MANAGER);

      await service.changeStatus(USER, statusInput);

      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: TASK },
        data: { status: TaskStatus.IN_PROGRESS },
      });

      expect(prisma.projectMember.findUnique).not.toHaveBeenCalled();
    });

    it('does not change a task belonging to another organization', async () => {
      const { service, prisma } = setup();
      prisma.task.findFirst.mockResolvedValue(null);

      await expect(
        service.changeStatus(USER, {
          ...statusInput,
          organizationId: OTHER_ORG,
        }),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.task.findFirst).toHaveBeenCalledWith({
        where: {
          id: TASK,
          organizationId: OTHER_ORG,
        },
      });

      expect(prisma.task.update).not.toHaveBeenCalled();
    });
  });
});