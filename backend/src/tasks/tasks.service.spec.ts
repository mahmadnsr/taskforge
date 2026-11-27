import { describe, it, expect, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  SortDirection,
  TaskQueryInput,
  TaskSortField,
} from './dto/task-query.input.js';
import {
  Role,
  Prisma,
  TaskPriority,
  TaskStatus,
} from '@prisma/client';
import type { NotificationsService } from '../notifications/notifications.service.js';
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
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: PROJECT }]),
    taskDependency: { count: vi.fn().mockResolvedValue(0) },
    taskActivity: { create: vi.fn().mockResolvedValue({ id: 'activity-1' }), findMany: vi.fn().mockResolvedValue([]) },
    task: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: TASK, organizationId: ORG, projectId: PROJECT, title: 'Prepare report' }),
      create: vi.fn().mockImplementation(async ({ data }) => ({
        id: TASK,
        ...data,
      })),
      update: vi.fn().mockImplementation(async ({ where, data }) => ({
        id: where.id,
        organizationId: ORG,
        projectId: PROJECT,
        title: 'Prepare report',
        ...data,
      })),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    organizationMember: {
      findUnique: vi.fn().mockResolvedValue({ userId: USER }),
    },
    notification: {
      create: vi.fn().mockResolvedValue({ id: 'notification-1' }),
    },
    outboxEvent: {
      create: vi.fn().mockImplementation(async ({ data }) => ({
        id: 'outbox-1',
        ...data,
      })),
    },
  };

  const prisma = {
    $transaction: vi.fn(async (callback) => callback(tx)),
    taskActivity: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findMany: vi.fn().mockResolvedValue([]) },

    organizationMember: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          role ? { userId: USER, organizationId: ORG, role } : null,
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
      findUnique: vi.fn().mockResolvedValue({ id: 'membership-1', organizationId: ORG, orgMember: { role: Role.EMPLOYEE } }),
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
        description: null,
        priority: TaskPriority.MEDIUM,
        dueDate: null,
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

      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };

  const notificationsService = {
    createForRecipient: vi.fn().mockResolvedValue({ id: 'notification-1' }),
  };

  const queuesService = {
    enqueueTaskEvent: vi.fn().mockResolvedValue({ id: 'event-1' }),
  };

  const service = new TasksService(
    prisma as unknown as PrismaService,
    notificationsService as unknown as NotificationsService,
    queuesService as never,
  );

  return { service, prisma, tx, notificationsService, queuesService };
}

const input = {
  organizationId: ORG,
  projectId: PROJECT,
  title: 'Prepare report',
} satisfies CreateTaskInput;

describe('TasksService', () => {
  describe('create', () => {
    it('creates a task with trimmed fields and default priority', async () => {
      const { service, tx } = setup();

      await service.create(USER, {
        ...input,
        title: '  Prepare report  ',
        description: '  Monthly report  ',
      });

      expect(tx.task.create).toHaveBeenCalledWith({
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

    it('writes a task-created event to the transactional outbox', async () => {
      const { service, tx, queuesService } = setup();

      await service.create(USER, input);

      expect(tx.outboxEvent.create).toHaveBeenCalledWith({
        data: {
          eventType: 'TASK_CREATED',
          payload: expect.objectContaining({
            eventId: `created-${TASK}`,
            organizationId: ORG,
            taskId: TASK,
            actorId: USER,
            eventType: 'TASK_CREATED',
            occurredAt: expect.any(String),
          }),
        },
      });

      expect(queuesService.enqueueTaskEvent).not.toHaveBeenCalled();
    });

    it('uses the supplied priority and due date', async () => {
      const { service, tx } = setup();
      const dueDate = new Date('2027-01-15T00:00:00.000Z');

      await service.create(USER, {
        ...input,
        priority: TaskPriority.HIGH,
        dueDate,
      });

      expect(tx.task.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          priority: TaskPriority.HIGH,
          dueDate,
        }),
      });
    });

    it('rejects a user who is not an organization member', async () => {
      const { service, prisma } = setup(null);

      await expect(service.create(USER, input)).rejects.toThrow(
        ForbiddenException,
      );

      expect(prisma.project.findUnique).not.toHaveBeenCalled();
      expect(prisma.task.create).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a project that does not belong to the organization', async () => {
      const { service, prisma } = setup();
      prisma.project.findUnique.mockResolvedValue(null);

      await expect(service.create(USER, input)).rejects.toThrow(
        NotFoundException,
      );

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

      await expect(service.create(USER, input)).rejects.toThrow(
        'Cannot modify tasks in an archived project',
      );

      expect(prisma.task.create).not.toHaveBeenCalled();
    });

    it.each([undefined, ASSIGNEE, 'admin-1', 'manager-1', 'employee-2'])(
      'rejects EMPLOYEE task creation with assignee %s',
      async (assigneeId) => {
        const { service, prisma, tx } = setup(Role.EMPLOYEE);

        await expect(service.create(USER, { ...input, assigneeId })).rejects.toThrow(
          'Only admins and managers can create tasks',
        );

        expect(prisma.project.findUnique).not.toHaveBeenCalled();
        expect(prisma.projectMember.findUnique).not.toHaveBeenCalled();
        expect(tx.task.create).not.toHaveBeenCalled();
        expect(prisma.$transaction).not.toHaveBeenCalled();
      },
    );

    it('allows a MANAGER who belongs to the project to create a task', async () => {
      const { service, prisma, tx } = setup(Role.MANAGER);

      await service.create(USER, input);

      expect(tx.task.create).toHaveBeenCalled();
      expect(prisma.projectMember.findUnique).toHaveBeenCalled();
    });

    it('rejects a MANAGER who does not belong to the project', async () => {
      const { service, prisma, tx } = setup(Role.MANAGER);
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(service.create(USER, input)).rejects.toThrow(
        'You must be a project member to create tasks',
      );

      expect(tx.task.create).not.toHaveBeenCalled();
    });

    it('rejects an assignee who is not a project member', async () => {
      const { service, prisma } = setup();
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        service.create(USER, {
          ...input,
          assigneeId: ASSIGNEE,
        }),
      ).rejects.toThrow('Assignee must be a member of this project');

      expect(prisma.task.create).not.toHaveBeenCalled();
    });

    it('accepts an assignee who belongs to the project', async () => {
      const { service, tx } = setup();

      await service.create(USER, {
        ...input,
        assigneeId: ASSIGNEE,
      });

      expect(tx.task.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          assigneeId: ASSIGNEE,
          createdById: USER,
        }),
      });
    });

    it.each([Role.ADMIN, Role.MANAGER])('MANAGER cannot create a task assigned to %s', async (targetRole) => {
      const { service, prisma, tx } = setup(Role.MANAGER);
      prisma.projectMember.findUnique.mockResolvedValue({ organizationId: ORG, orgMember: { role: targetRole } });

      await expect(service.create(USER, { ...input, assigneeId: ASSIGNEE })).rejects.toThrow(
        'Managers can assign tasks only to project employees',
      );
      expect(tx.task.create).not.toHaveBeenCalled();
    });

    it('rejects an assignee from another organization even with a matching project lookup', async () => {
      const { service, prisma, tx } = setup();
      prisma.projectMember.findUnique.mockResolvedValue({ organizationId: OTHER_ORG, orgMember: { role: Role.EMPLOYEE } });

      await expect(service.create(USER, { ...input, assigneeId: ASSIGNEE })).rejects.toThrow(
        'Assignee must be a member of this project',
      );
      expect(tx.task.create).not.toHaveBeenCalled();
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

      await expect(service.get(USER, ORG, TASK)).rejects.toThrow(
        ForbiddenException,
      );

      expect(prisma.task.findFirst).not.toHaveBeenCalled();
    });

    it('returns a task scoped to the organization', async () => {
      const { service, prisma } = setup();

      await expect(service.get(USER, ORG, TASK)).resolves.toEqual({
        id: TASK,
        organizationId: ORG,
        projectId: PROJECT,
        title: 'Prepare report',
        status: TaskStatus.TODO,
        description: null,
        priority: TaskPriority.MEDIUM,
        dueDate: null,
        assigneeId: ASSIGNEE,
      });

      expect(prisma.task.findFirst).toHaveBeenCalledWith({
        where: {
          id: TASK,
          organizationId: ORG,
          deletedAt: null,
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

      await expect(service.get(USER, ORG, TASK)).resolves.toEqual(
        expect.objectContaining({
          id: TASK,
          projectId: PROJECT,
        }),
      );
    });

    it('throws NotFoundException when the task is absent from the organization', async () => {
      const { service, prisma } = setup();
      prisma.task.findFirst.mockResolvedValue(null);

      await expect(service.get(USER, ORG, TASK)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects an EMPLOYEE who is not a project member', async () => {
      const { service, prisma } = setup(Role.EMPLOYEE);
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(service.get(USER, ORG, TASK)).rejects.toThrow(
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

      await expect(service.get(USER, OTHER_ORG, TASK)).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.task.findFirst).toHaveBeenCalledWith({
        where: {
          id: TASK,
          organizationId: OTHER_ORG,
          deletedAt: null,
        },
      });
    });
  });

  describe('listByProject', () => {
    it('rejects a user who is not an organization member', async () => {
      const { service, prisma } = setup(null);

      await expect(service.listByProject(USER, ORG, PROJECT)).rejects.toThrow(
        ForbiddenException,
      );

      expect(prisma.task.findMany).not.toHaveBeenCalled();
    });

    it('rejects a project outside the organization', async () => {
      const { service, prisma } = setup();
      prisma.project.findUnique.mockResolvedValue(null);

      await expect(service.listByProject(USER, ORG, PROJECT)).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.task.findMany).not.toHaveBeenCalled();
    });

    it('rejects an EMPLOYEE who is not a project member', async () => {
      const { service, prisma } = setup(Role.EMPLOYEE);
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(service.listByProject(USER, ORG, PROJECT)).rejects.toThrow(
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
          deletedAt: null,
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
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('returns the result from Prisma', async () => {
      const { service, prisma } = setup();
      const tasks = [{ id: TASK, title: 'Prepare report' }];

      prisma.task.findMany.mockResolvedValue(tasks);

      await expect(service.listByProject(USER, ORG, PROJECT)).resolves.toEqual(
        tasks,
      );
    });

    it('allows an EMPLOYEE who belongs to the project to list tasks', async () => {
      const { service, prisma } = setup(Role.EMPLOYEE);

      await service.listByProject(USER, ORG, PROJECT);

      expect(prisma.projectMember.findUnique).toHaveBeenCalled();
      expect(prisma.task.findMany).toHaveBeenCalled();
    });

    it('allows a MANAGER who belongs to the project to list tasks', async () => {
      const { service, prisma } = setup(Role.MANAGER);

      await service.listByProject(USER, ORG, PROJECT);

      expect(prisma.task.findMany).toHaveBeenCalled();
      expect(prisma.projectMember.findUnique).toHaveBeenCalled();
    });

    it('rejects a MANAGER who does not belong to the project', async () => {
      const { service, prisma } = setup(Role.MANAGER);
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        service.listByProject(USER, ORG, PROJECT),
      ).rejects.toThrow('You must be a project member to view project tasks');

      expect(prisma.task.findMany).not.toHaveBeenCalled();
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
          deletedAt: null,
        },
        orderBy: [{ createdAt: SortDirection.DESC }, { id: 'asc' }],
        take: 20,
        skip: 0,
      });

      expect(prisma.task.count).toHaveBeenCalledWith({
        where: {
          organizationId: ORG,
          projectId: PROJECT,
          deletedAt: null,
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

      await service.searchProjectTasks(USER, ORG, PROJECT, filters);

      const expectedWhere = {
        organizationId: ORG,
        projectId: PROJECT,
        deletedAt: null,
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
        orderBy: [{ updatedAt: SortDirection.ASC }, { id: 'asc' }],
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

      await expect(
        service.searchProjectTasks(USER, ORG, PROJECT, {
          limit: 10,
          offset: 10,
        }),
      ).resolves.toMatchObject({
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

      await expect(
        service.searchProjectTasks(USER, ORG, PROJECT, {
          limit: 2,
          offset: 3,
        }),
      ).resolves.toMatchObject({
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

      expect(prisma.task.findMany.mock.calls[0][0].where).not.toHaveProperty(
        'OR',
      );
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
      ).rejects.toThrow('You must be a project member to view project tasks');

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

    it.each([-1, 1.5, NaN])('rejects invalid offset: %s', async (offset) => {
      const { service, prisma } = setup();

      await expect(
        service.searchProjectTasks(USER, ORG, PROJECT, {
          offset,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.task.findMany).not.toHaveBeenCalled();
      expect(prisma.task.count).not.toHaveBeenCalled();
    });

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

    it('allows a MANAGER who belongs to the project to search tasks', async () => {
      const { service, prisma } = setup(Role.MANAGER);

      await service.searchProjectTasks(USER, ORG, PROJECT);

      expect(prisma.task.findMany).toHaveBeenCalled();
      expect(prisma.task.count).toHaveBeenCalled();
      expect(prisma.projectMember.findUnique).toHaveBeenCalled();
    });

    it('rejects a MANAGER who does not belong to the project', async () => {
      const { service, prisma } = setup(Role.MANAGER);
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        service.searchProjectTasks(USER, ORG, PROJECT),
      ).rejects.toThrow('You must be a project member to view project tasks');

      expect(prisma.task.findMany).not.toHaveBeenCalled();
      expect(prisma.task.count).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const updateInput = {
      organizationId: ORG,
      taskId: TASK,
      title: '  Updated report  ',
    } satisfies UpdateTaskInput;

    it('updates fields and trims the title', async () => {
      const { service, tx } = setup();

      await service.update(USER, updateInput);

      expect(tx.task.update).toHaveBeenCalledWith({
        where: expect.objectContaining({ id: TASK, organizationId: ORG, projectId: PROJECT, deletedAt: null, title: 'Prepare report' }),
        data: { title: 'Updated report' },
      });
    });

    it('rejects a stale detail write before creating activity or outbox events', async () => {
      const { service, tx, notificationsService } = setup();
      tx.task.update.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError(
        'Record did not match the expected values', { code: 'P2025', clientVersion: '6.19.3' },
      ));

      await expect(service.update(USER, { organizationId: ORG, taskId: TASK, title: 'New title', assigneeId: 'assignee-2' }))
        .rejects.toThrow('Concurrent update detected, please retry');
      expect(tx.taskActivity.create).not.toHaveBeenCalled();
      expect(notificationsService.createForRecipient).not.toHaveBeenCalled();
      expect(tx.outboxEvent.create).not.toHaveBeenCalled();
    });

    it('rejects updating a task in an archived project', async () => {
      const { service, prisma, tx } = setup();

      prisma.project.findUnique.mockResolvedValue({
        id: PROJECT,
        organizationId: ORG,
        status: 'ARCHIVED',
      });

      await expect(service.update(USER, updateInput)).rejects.toThrow(
        'Cannot modify tasks in an archived project',
      );

      expect(tx.task.update).not.toHaveBeenCalled();
    });

    it('allows clearing nullable fields', async () => {
      const { service, tx } = setup();

      await service.update(USER, {
        organizationId: ORG,
        taskId: TASK,
        description: null,
        assigneeId: null,
        dueDate: null,
      });

      expect(tx.task.update).toHaveBeenCalledWith({
        where: expect.objectContaining({ id: TASK, organizationId: ORG, projectId: PROJECT, deletedAt: null, assigneeId: ASSIGNEE }),
        data: {
          description: null,
          assigneeId: null,
          dueDate: null,
        },
      });
    });

    it('allows a MANAGER to update task details', async () => {
      const { service, tx } = setup(Role.MANAGER);

      await service.update(USER, updateInput);

      expect(tx.task.update).toHaveBeenCalledWith({
        where: expect.objectContaining({ id: TASK, organizationId: ORG, projectId: PROJECT, deletedAt: null, title: 'Prepare report' }),
        data: { title: 'Updated report' },
      });
    });

    it('rejects EMPLOYEE task-detail updates', async () => {
      const { service, prisma, tx } = setup(Role.EMPLOYEE);

      await expect(service.update(USER, updateInput)).rejects.toThrow(
        ForbiddenException,
      );

      expect(prisma.task.findFirst).not.toHaveBeenCalled();
      expect(tx.task.update).not.toHaveBeenCalled();
    });

    it('rejects a task not found in the organization', async () => {
      const { service, prisma, tx } = setup();
      prisma.task.findFirst.mockResolvedValue(null);

      await expect(service.update(USER, updateInput)).rejects.toThrow(
        NotFoundException,
      );

      expect(tx.task.update).not.toHaveBeenCalled();
    });

    it('does not update a task belonging to another organization', async () => {
      const { service, prisma, tx } = setup();
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
          deletedAt: null,
        },
      });

      expect(tx.task.update).not.toHaveBeenCalled();
    });

    it('rejects an empty update', async () => {
      const { service, tx } = setup();

      await expect(
        service.update(USER, {
          organizationId: ORG,
          taskId: TASK,
        }),
      ).rejects.toThrow('Provide at least one field to update');

      expect(tx.task.update).not.toHaveBeenCalled();
    });

    it('rejects a blank title', async () => {
      const { service, tx } = setup();

      await expect(
        service.update(USER, {
          ...updateInput,
          title: '   ',
        }),
      ).rejects.toThrow('Task title cannot be empty');

      expect(tx.task.update).not.toHaveBeenCalled();
    });

    it('rejects an invalid due date', async () => {
      const { service, tx } = setup();

      await expect(
        service.update(USER, {
          organizationId: ORG,
          taskId: TASK,
          dueDate: new Date(Number.NaN),
        }),
      ).rejects.toThrow('Invalid due date');

      expect(tx.task.update).not.toHaveBeenCalled();
    });

    it('rejects an assignee who is not a project member', async () => {
      const { service, prisma, tx } = setup();
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        service.update(USER, {
          organizationId: ORG,
          taskId: TASK,
          assigneeId: 'assignee-2',
        }),
      ).rejects.toThrow('Assignee must be a member of this project');

      expect(tx.task.update).not.toHaveBeenCalled();
    });

    it('MANAGER cannot change task ownership to an ADMIN', async () => {
      const { service, prisma, tx } = setup(Role.MANAGER);
      prisma.projectMember.findUnique.mockResolvedValue({ organizationId: ORG, orgMember: { role: Role.ADMIN } });

      await expect(service.update(USER, { organizationId: ORG, taskId: TASK, assigneeId: 'admin-1' })).rejects.toThrow(
        'Managers can assign tasks only to project employees',
      );
      expect(tx.task.update).not.toHaveBeenCalled();
    });

    it('accepts an assignee who belongs to the project', async () => {
      const { service, tx } = setup();

      await service.update(USER, {
        organizationId: ORG,
        taskId: TASK,
        assigneeId: ASSIGNEE,
      });

      expect(tx.task.update).toHaveBeenCalledWith({
        where: expect.objectContaining({ id: TASK, organizationId: ORG, projectId: PROJECT, deletedAt: null, assigneeId: ASSIGNEE }),
        data: { assigneeId: ASSIGNEE },
      });
    });

    it('notifies the new assignee when updating task assignment', async () => {
      const { service, notificationsService } = setup();

      await service.update(USER, {
        organizationId: ORG,
        taskId: TASK,
        assigneeId: 'assignee-2',
      });

      expect(notificationsService.createForRecipient).toHaveBeenCalledOnce();

      expect(notificationsService.createForRecipient).toHaveBeenCalledWith(
        expect.anything(),
        {
          organizationId: ORG,
          recipientId: 'assignee-2',
          taskId: TASK,
          type: 'TASK_ASSIGNED',
          message: 'You have been assigned to task: Prepare report',
        },
      );
    });

    it('does not notify when the assignee remains unchanged', async () => {
      const { service, notificationsService } = setup();

      await service.update(USER, {
        organizationId: ORG,
        taskId: TASK,
        assigneeId: ASSIGNEE,
      });

      expect(notificationsService.createForRecipient).not.toHaveBeenCalled();
    });
  });

  describe('assign', () => {
    const assignInput = {
      organizationId: ORG,
      taskId: TASK,
      assigneeId: ASSIGNEE,
    } satisfies AssignTaskInput;

    it('allows an ADMIN to assign a task', async () => {
      const { service, tx } = setup(Role.ADMIN);

      await service.assign(USER, assignInput);

      expect(tx.task.update).toHaveBeenCalledWith({
        where: expect.objectContaining({ id: TASK, organizationId: ORG, projectId: PROJECT, deletedAt: null, assigneeId: ASSIGNEE }),
        data: { assigneeId: ASSIGNEE },
      });
    });

    it('rejects a stale assignment before creating activity or notification effects', async () => {
      const { service, tx, notificationsService } = setup();
      tx.task.update.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError(
        'Record did not match the expected assignee', { code: 'P2025', clientVersion: '6.19.3' },
      ));

      await expect(service.assign(USER, { ...assignInput, assigneeId: 'assignee-2' }))
        .rejects.toThrow('Concurrent update detected, please retry');
      expect(tx.taskActivity.create).not.toHaveBeenCalled();
      expect(notificationsService.createForRecipient).not.toHaveBeenCalled();
      expect(tx.outboxEvent.create).not.toHaveBeenCalled();
    });

    it('notifies the new assignee when assigning a task', async () => {
      const { service, notificationsService } = setup();

      await service.assign(USER, {
        ...assignInput,
        assigneeId: 'assignee-2',
      });

      expect(notificationsService.createForRecipient).toHaveBeenCalledOnce();
      expect(notificationsService.createForRecipient).toHaveBeenCalledWith(
        expect.anything(),
        {
          organizationId: ORG,
          recipientId: 'assignee-2',
          taskId: TASK,
          type: 'TASK_ASSIGNED',
          message: 'You have been assigned to task: Prepare report',
        },
      );
    });

    it('uses unique outbox event IDs for distinct assignments in the same millisecond', async () => {
      const { service, tx } = setup();
      const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
      try {
        await service.assign(USER, { ...assignInput, assigneeId: 'assignee-2' });
        await service.assign(USER, { ...assignInput, assigneeId: 'assignee-3' });
      } finally {
        clock.mockRestore();
      }
      const eventIds = tx.outboxEvent.create.mock.calls.map(([argument]) => argument.data.payload.eventId);
      expect(eventIds).toHaveLength(2);
      expect(new Set(eventIds).size).toBe(2);
    });

    it('does not notify when assigning the task to the existing assignee', async () => {
      const { service, notificationsService } = setup();

      await service.assign(USER, assignInput);

      expect(notificationsService.createForRecipient).not.toHaveBeenCalled();
    });

    it('allows a MANAGER to assign a task', async () => {
      const { service, tx } = setup(Role.MANAGER);

      await service.assign(USER, assignInput);

      expect(tx.task.update).toHaveBeenCalledWith({
        where: expect.objectContaining({ id: TASK, organizationId: ORG, projectId: PROJECT, deletedAt: null, assigneeId: ASSIGNEE }),
        data: { assigneeId: ASSIGNEE },
      });
    });

    it.each([Role.ADMIN, Role.MANAGER])('MANAGER cannot assign a task to %s', async (targetRole) => {
      const { service, prisma, tx } = setup(Role.MANAGER);
      prisma.projectMember.findUnique.mockResolvedValue({ organizationId: ORG, orgMember: { role: targetRole } });

      await expect(service.assign(USER, { ...assignInput, assigneeId: 'target-1' })).rejects.toThrow(
        'Managers can assign tasks only to project employees',
      );
      expect(tx.task.update).not.toHaveBeenCalled();
    });

    it('ADMIN retains the ability to assign a project MANAGER', async () => {
      const { service, prisma, tx } = setup(Role.ADMIN);
      prisma.projectMember.findUnique.mockResolvedValue({ organizationId: ORG, orgMember: { role: Role.MANAGER } });

      await service.assign(USER, { ...assignInput, assigneeId: 'manager-1' });
      expect(tx.task.update).toHaveBeenCalledWith({ where: expect.objectContaining({ id: TASK, organizationId: ORG, projectId: PROJECT, deletedAt: null, assigneeId: ASSIGNEE }), data: { assigneeId: 'manager-1' } });
    });

    it.each([ASSIGNEE, 'admin-1', 'manager-1', 'employee-2', null])(
      'rejects an EMPLOYEE attempting to assign a task to %s',
      async (assigneeId) => {
        const { service, tx } = setup(Role.EMPLOYEE);

        await expect(service.assign(USER, { ...assignInput, assigneeId })).rejects.toThrow(
          ForbiddenException,
        );

        expect(tx.task.update).not.toHaveBeenCalled();
      },
    );

    it('rejects a user who is not an organization member', async () => {
      const { service, tx } = setup(null);

      await expect(service.assign(USER, assignInput)).rejects.toThrow(
        ForbiddenException,
      );

      expect(tx.task.update).not.toHaveBeenCalled();
    });

    it('rejects assigning a task that does not exist in the organization', async () => {
      const { service, prisma, tx } = setup();
      prisma.task.findFirst.mockResolvedValue(null);

      await expect(service.assign(USER, assignInput)).rejects.toThrow(
        NotFoundException,
      );

      expect(tx.task.update).not.toHaveBeenCalled();
    });

    it('rejects an assignee who is not a member of the project', async () => {
      const { service, prisma, tx } = setup();
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(service.assign(USER, assignInput)).rejects.toThrow(
        'Assignee must be a member of this project',
      );

      expect(tx.task.update).not.toHaveBeenCalled();
    });

    it('rejects assignment in an archived project', async () => {
      const { service, prisma, tx } = setup();

      prisma.project.findUnique.mockResolvedValue({
        id: PROJECT,
        organizationId: ORG,
        status: 'ARCHIVED',
      });

      await expect(service.assign(USER, assignInput)).rejects.toThrow(
        'Cannot modify tasks in an archived project',
      );

      expect(tx.task.update).not.toHaveBeenCalled();
    });

    it('allows unassigning a task with explicit null', async () => {
      const { service, prisma, tx } = setup();

      await service.assign(USER, {
        ...assignInput,
        assigneeId: null,
      });

      expect(tx.task.update).toHaveBeenCalledWith({
        where: expect.objectContaining({ id: TASK, organizationId: ORG, projectId: PROJECT, deletedAt: null, assigneeId: ASSIGNEE }),
        data: { assigneeId: null },
      });

      expect(prisma.projectMember.findUnique).not.toHaveBeenCalled();
    });

    it('rejects an omitted assigneeId', async () => {
      const { service, tx } = setup();

      const incompleteInput = {
        organizationId: ORG,
        taskId: TASK,
      };

      await expect(
        service.assign(USER, incompleteInput as AssignTaskInput),
      ).rejects.toThrow('Provide assigneeId or null to unassign the task');

      expect(tx.task.update).not.toHaveBeenCalled();
    });
  });

  describe('changeStatus', () => {
    const statusInput = {
      organizationId: ORG,
      taskId: TASK,
      status: TaskStatus.IN_PROGRESS,
    } satisfies ChangeTaskStatusInput;

    it('allows TODO to IN_PROGRESS', async () => {
      const { service, tx } = setup();

      await service.changeStatus(USER, statusInput);

      expect(tx.task.updateMany).toHaveBeenCalledWith({
        where: { id: TASK, organizationId: ORG, projectId: PROJECT, deletedAt: null, status: TaskStatus.TODO },
        data: { status: TaskStatus.IN_PROGRESS },
      });
    });

    it('notifies the task creator when another user changes status', async () => {
      const { service, prisma, notificationsService } = setup();

      prisma.task.findFirst.mockResolvedValue({
        id: TASK,
        organizationId: ORG,
        projectId: PROJECT,
        title: 'Prepare report',
        status: TaskStatus.TODO,
        assigneeId: ASSIGNEE,
        createdById: 'task-creator',
      });

      await service.changeStatus(USER, statusInput);

      expect(notificationsService.createForRecipient).toHaveBeenCalledWith(
        expect.anything(),
        {
          organizationId: ORG,
          recipientId: 'task-creator',
          taskId: TASK,
          type: 'TASK_STATUS_CHANGED',
          message: 'Task "Prepare report" status changed to IN_PROGRESS',
        },
      );
    });

    it('does not notify the task creator when they change status themselves', async () => {
      const { service, prisma, notificationsService } = setup();

      prisma.task.findFirst.mockResolvedValue({
        id: TASK,
        organizationId: ORG,
        projectId: PROJECT,
        title: 'Prepare report',
        status: TaskStatus.TODO,
        assigneeId: ASSIGNEE,
        createdById: USER,
      });

      await service.changeStatus(USER, statusInput);

      expect(notificationsService.createForRecipient).not.toHaveBeenCalled();
    });

    it('rejects changing task status in an archived project', async () => {
      const { service, prisma, tx } = setup();

      prisma.project.findUnique.mockResolvedValue({
        id: PROJECT,
        organizationId: ORG,
        status: 'ARCHIVED',
      });

      await expect(service.changeStatus(USER, statusInput)).rejects.toThrow(
        'Cannot modify tasks in an archived project',
      );

      expect(tx.task.update).not.toHaveBeenCalled();
    });

    it('allows IN_PROGRESS to IN_REVIEW', async () => {
      const { service, prisma, tx } = setup();

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

      expect(tx.task.updateMany).toHaveBeenCalledWith({
        where: { id: TASK, organizationId: ORG, projectId: PROJECT, deletedAt: null, status: TaskStatus.IN_PROGRESS },
        data: { status: TaskStatus.IN_REVIEW },
      });
    });

    it('allows IN_REVIEW to IN_PROGRESS', async () => {
      const { service, prisma, tx } = setup();

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

      expect(tx.task.updateMany).toHaveBeenCalledWith({
        where: { id: TASK, organizationId: ORG, projectId: PROJECT, deletedAt: null, status: TaskStatus.IN_REVIEW },
        data: { status: TaskStatus.IN_PROGRESS },
      });
    });

    it('allows IN_REVIEW to DONE', async () => {
      const { service, prisma, tx } = setup();

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

      expect(tx.task.updateMany).toHaveBeenCalledWith({
        where: { id: TASK, organizationId: ORG, projectId: PROJECT, deletedAt: null, status: TaskStatus.IN_REVIEW },
        data: { status: TaskStatus.DONE },
      });
    });

    it.each([TaskStatus.DONE, TaskStatus.IN_PROGRESS])('rejects employee review transition to %s', async (status) => {
      const { service, prisma, tx } = setup(Role.EMPLOYEE);
      prisma.task.findFirst.mockResolvedValue({
        id: TASK, organizationId: ORG, projectId: PROJECT,
        status: TaskStatus.IN_REVIEW, assigneeId: USER,
      });
      await expect(service.changeStatus(USER, { ...statusInput, status })).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.task.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a racing approval without recording activity or notifications', async () => {
      const { service, prisma, tx, notificationsService } = setup();
      prisma.task.findFirst.mockResolvedValue({
        id: TASK, organizationId: ORG, projectId: PROJECT,
        status: TaskStatus.IN_REVIEW, assigneeId: ASSIGNEE,
      });
      tx.task.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.changeStatus(USER, { ...statusInput, status: TaskStatus.DONE })).rejects.toBeInstanceOf(ConflictException);
      expect(tx.taskActivity.create).not.toHaveBeenCalled();
      expect(notificationsService.createForRecipient).not.toHaveBeenCalled();
    });

    it('rejects TODO directly to DONE', async () => {
      const { service, tx } = setup();

      await expect(
        service.changeStatus(USER, {
          ...statusInput,
          status: TaskStatus.DONE,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(tx.task.update).not.toHaveBeenCalled();
    });

    it('rejects IN_PROGRESS directly to DONE', async () => {
      const { service, prisma, tx } = setup();

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

      expect(tx.task.update).not.toHaveBeenCalled();
    });

    it('rejects any transition from DONE', async () => {
      const { service, prisma, tx } = setup();

      prisma.task.findFirst.mockResolvedValue({
        id: TASK,
        organizationId: ORG,
        projectId: PROJECT,
        status: TaskStatus.DONE,
        assigneeId: ASSIGNEE,
      });

      await expect(service.changeStatus(USER, statusInput)).rejects.toThrow(
        'Invalid task status transition',
      );

      expect(tx.task.update).not.toHaveBeenCalled();
    });

    it('rejects a missing task', async () => {
      const { service, prisma, tx } = setup();
      prisma.task.findFirst.mockResolvedValue(null);

      await expect(service.changeStatus(USER, statusInput)).rejects.toThrow(
        NotFoundException,
      );

      expect(tx.task.update).not.toHaveBeenCalled();
    });

    it('rejects a user who is not an organization member', async () => {
      const { service, prisma } = setup(null);

      await expect(service.changeStatus(USER, statusInput)).rejects.toThrow(
        ForbiddenException,
      );

      expect(prisma.task.findFirst).not.toHaveBeenCalled();
    });

    it('rejects an EMPLOYEE who is not a project member', async () => {
      const { service, prisma, tx } = setup(Role.EMPLOYEE);
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(service.changeStatus(USER, statusInput)).rejects.toThrow(
        'You must be a project member to change task status',
      );

      expect(tx.task.update).not.toHaveBeenCalled();
    });

    it('rejects an EMPLOYEE who is not assigned to the task', async () => {
      const { service, tx } = setup(Role.EMPLOYEE);

      await expect(service.changeStatus(USER, statusInput)).rejects.toThrow(
        'You can only change the status of tasks assigned to you',
      );

      expect(tx.task.update).not.toHaveBeenCalled();
    });

    it('allows an assigned EMPLOYEE to advance the task', async () => {
      const { service, prisma, tx } = setup(Role.EMPLOYEE);

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

      expect(tx.task.updateMany).toHaveBeenCalledWith({
        where: { id: TASK, organizationId: ORG, projectId: PROJECT, deletedAt: null, status: TaskStatus.TODO },
        data: { status: TaskStatus.IN_PROGRESS },
      });
    });

    it('allows a MANAGER who belongs to the project to change task status', async () => {
      const { service, prisma, tx } = setup(Role.MANAGER);

      await service.changeStatus(USER, statusInput);

      expect(tx.task.updateMany).toHaveBeenCalledWith({
        where: { id: TASK, organizationId: ORG, projectId: PROJECT, deletedAt: null, status: TaskStatus.TODO },
        data: { status: TaskStatus.IN_PROGRESS },
      });

      expect(prisma.projectMember.findUnique).toHaveBeenCalled();
    });

    it('rejects a MANAGER who does not belong to the project', async () => {
      const { service, prisma, tx } = setup(Role.MANAGER);
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        service.changeStatus(USER, statusInput),
      ).rejects.toThrow('You must be a project member to view project tasks');

      expect(tx.task.update).not.toHaveBeenCalled();
    });

    it('does not change a task belonging to another organization', async () => {
      const { service, prisma, tx } = setup();
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
          deletedAt: null,
        },
      });

      expect(tx.task.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteTask', () => {
    it('soft-deletes a root and its children with activity in one transaction', async () => {
      const { service, prisma, tx } = setup(Role.ADMIN);
      tx.task.findMany.mockResolvedValue([{ id: 'child-1' }]);

      await expect(service.deleteTask(USER, ORG, TASK)).resolves.toBe(true);

      expect(tx.task.updateMany).toHaveBeenCalledTimes(2);
      expect(tx.task.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: TASK, organizationId: ORG, projectId: PROJECT, deletedAt: null },
        data: { deletedAt: expect.any(Date) },
      });
      expect(tx.task.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: 'child-1', parentId: TASK, organizationId: ORG, projectId: PROJECT, deletedAt: null },
        data: { deletedAt: expect.any(Date) },
      });
      expect(tx.taskActivity.create).toHaveBeenCalledWith({ data: expect.objectContaining({ taskId: 'child-1', type: 'SUBTASK_DELETED' }) });
      expect(tx.taskActivity.create).toHaveBeenCalledWith({ data: expect.objectContaining({ taskId: TASK, type: 'SUBTASK_DELETED', details: { subtaskId: 'child-1' } }) });
      expect(tx.taskActivity.create).toHaveBeenCalledWith({ data: expect.objectContaining({ taskId: TASK, type: 'TASK_DELETED' }) });
      expect(prisma.task.deleteMany).not.toHaveBeenCalled();
    });

    it('allows a MANAGER to soft-delete a task', async () => {
      const { service, tx } = setup(Role.MANAGER);

      await expect(service.deleteTask(USER, ORG, TASK)).resolves.toBe(true);

      expect(tx.task.updateMany).toHaveBeenCalledOnce();
    });

    it('does not duplicate child deletion activity after a concurrent child deletion', async () => {
      const { service, tx } = setup();
      tx.task.findMany.mockResolvedValue([{ id: 'child-1' }]);
      tx.task.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

      await service.deleteTask(USER, ORG, TASK);

      expect(tx.taskActivity.create.mock.calls.map(([call]) => call.data.type)).toEqual(['TASK_DELETED']);
    });

    it('rejects EMPLOYEE task deletion', async () => {
      const { service, prisma } = setup(Role.EMPLOYEE);

      await expect(
        service.deleteTask(USER, ORG, TASK),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.task.deleteMany).not.toHaveBeenCalled();
    });

    it('rejects deletion by a user who is not an organization member', async () => {
      const { service, prisma } = setup(null);

      await expect(
        service.deleteTask(USER, ORG, TASK),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.task.deleteMany).not.toHaveBeenCalled();
    });

    it('rejects a task that does not exist in the organization', async () => {
      const { service, prisma } = setup();

      prisma.task.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteTask(USER, OTHER_ORG, TASK),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.task.deleteMany).not.toHaveBeenCalled();
    });

    it('rejects deletion when the project is archived', async () => {
      const { service, prisma } = setup();

      prisma.project.findUnique.mockResolvedValue({
        id: PROJECT,
        organizationId: ORG,
        status: 'ARCHIVED',
      });

      await expect(
        service.deleteTask(USER, ORG, TASK),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.task.deleteMany).not.toHaveBeenCalled();
    });

    it('handles a task deleted concurrently', async () => {
      const { service, tx } = setup();

      tx.task.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.deleteTask(USER, ORG, TASK),
      ).rejects.toThrow(NotFoundException);
    });

    it('propagates activity insertion failure inside the delete transaction', async () => {
      const { service, prisma, tx } = setup();
      tx.taskActivity.create.mockRejectedValueOnce(new Error('activity insert failed'));

      await expect(service.deleteTask(USER, ORG, TASK)).rejects.toThrow('activity insert failed');
      expect(prisma.$transaction).toHaveBeenCalledOnce();
      expect(tx.task.updateMany).toHaveBeenCalled();
      expect(prisma.task.deleteMany).not.toHaveBeenCalled();
    });
  });
});

describe('task activity recording and history', () => {
  it('records creation in the same transaction as the outbox', async () => {
    const { service, tx, prisma } = setup();
    await service.create(USER, input);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.taskActivity.create).toHaveBeenCalledWith({ data: expect.objectContaining({ taskId: TASK, organizationId: ORG, actorId: USER, type: 'TASK_CREATED' }) });
    expect(tx.outboxEvent.create).toHaveBeenCalledOnce();
  });

  it('records priority, deadline and assignment changes without descriptions', async () => {
    const { service, tx, prisma } = setup();
    prisma.task.findFirst.mockResolvedValue({ id: TASK, organizationId: ORG, projectId: PROJECT, title: 'Prepare report', description: null, priority: TaskPriority.LOW, dueDate: null, assigneeId: ASSIGNEE });
    await service.update(USER, { organizationId: ORG, taskId: TASK, priority: TaskPriority.HIGH, dueDate: new Date('2026-12-01T00:00:00Z'), assigneeId: null, description: 'private notes' });
    const events = tx.taskActivity.create.mock.calls.map(([call]) => call.data);
    expect(events.map((event) => event.type)).toEqual(['TASK_UPDATED', 'TASK_PRIORITY_CHANGED', 'TASK_DEADLINE_CHANGED', 'TASK_ASSIGNED']);
    expect(events.find((event) => event.type === 'TASK_PRIORITY_CHANGED').details).toEqual({ old: 'LOW', new: 'HIGH' });
    expect(JSON.stringify(events)).not.toContain('private notes');
  });

  it('does not record unchanged task values or assignment', async () => {
    const { service, tx, prisma } = setup();
    prisma.task.findFirst.mockResolvedValue({ id: TASK, organizationId: ORG, projectId: PROJECT, title: 'Prepare report', description: null, priority: TaskPriority.MEDIUM, dueDate: null, assigneeId: ASSIGNEE });
    await service.update(USER, { organizationId: ORG, taskId: TASK, title: 'Prepare report', priority: TaskPriority.MEDIUM });
    await service.assign(USER, { organizationId: ORG, taskId: TASK, assigneeId: ASSIGNEE });
    expect(tx.taskActivity.create).not.toHaveBeenCalled();
  });

  it('records status and preserves notification/outbox writes', async () => {
    const { service, tx } = setup();
    await service.changeStatus('other-user', { organizationId: ORG, taskId: TASK, status: TaskStatus.IN_PROGRESS });
    expect(tx.taskActivity.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: 'TASK_STATUS_CHANGED', details: { old: 'TODO', new: 'IN_PROGRESS' } }) });
    expect(tx.outboxEvent.create).toHaveBeenCalledOnce();
  });

  it('aborts before publishing the outbox if activity insertion fails', async () => {
    const { service, tx } = setup();
    tx.taskActivity.create.mockRejectedValueOnce(new Error('activity insert failed'));
    await expect(service.create(USER, input)).rejects.toThrow('activity insert failed');
    expect(tx.outboxEvent.create).not.toHaveBeenCalled();
  });

  it('paginates by timestamp and ID and rejects unauthorized or other-organization reads', async () => {
    const { service, prisma } = setup(Role.MANAGER);
    const date = new Date('2026-11-20T00:00:00Z');
    prisma.taskActivity.findMany.mockResolvedValueOnce([
      { id: 'b', taskId: TASK, organizationId: ORG, actorId: USER, type: 'TASK_CREATED', details: {}, createdAt: date },
      { id: 'a', taskId: TASK, organizationId: ORG, actorId: USER, type: 'TASK_UPDATED', details: {}, createdAt: date },
    ]);
    prisma.user.findMany.mockResolvedValue([{ id: USER, name: 'Member' }]);
    const page = await service.activityHistory(USER, { organizationId: ORG, taskId: TASK, first: 1 });
    expect(page).toMatchObject({ hasMore: true, items: [{ actorName: 'Member', details: '{}' }] });
    expect(page.nextCursor).toBeTruthy();
    await service.activityHistory(USER, { organizationId: ORG, taskId: TASK, first: 1, after: page.nextCursor! });
    expect(prisma.taskActivity.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG, taskId: TASK, OR: expect.any(Array) }), orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }));
    prisma.projectMember.findUnique.mockResolvedValue(null);
    await expect(service.activityHistory(USER, { organizationId: ORG, taskId: TASK })).rejects.toBeInstanceOf(ForbiddenException);
    prisma.taskActivity.findMany.mockClear();
    prisma.task.findFirst.mockResolvedValue(null);
    await expect(service.activityHistory(USER, { organizationId: OTHER_ORG, taskId: TASK })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.taskActivity.findMany).not.toHaveBeenCalled();
  });

  it('allows authorized history access after soft deletion while hiding normal task details', async () => {
    const { service, prisma } = setup(Role.MANAGER);
    prisma.task.findFirst.mockImplementation(async ({ where }) => where.deletedAt === null ? null : { id: TASK, organizationId: ORG, projectId: PROJECT, deletedAt: new Date() });

    await expect(service.get(USER, ORG, TASK)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.activityHistory(USER, { organizationId: ORG, taskId: TASK })).resolves.toMatchObject({ items: [] });
    expect(prisma.taskActivity.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ taskId: TASK, organizationId: ORG }) }));
    prisma.projectMember.findUnique.mockResolvedValue(null);
    await expect(service.activityHistory(USER, { organizationId: ORG, taskId: TASK })).rejects.toBeInstanceOf(ForbiddenException);
  });
});
