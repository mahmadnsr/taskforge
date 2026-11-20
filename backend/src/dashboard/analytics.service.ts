import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { calculateProjectProgress, calculateTaskProgress } from './progress.js';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private async role(userId: string, organizationId: string): Promise<Role> {
    const member = await this.prisma.organizationMember.findFirst({
      where: { userId, organizationId }, select: { role: true },
    });
    if (!member) throw new ForbiddenException('You are not a member of this organization');
    return member.role;
  }

  private async projectAccess(userId: string, organizationId: string, projectId: string, role: Role) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId }, select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (role !== Role.ADMIN) {
      const member = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } }, select: { id: true },
      });
      if (!member) throw new ForbiddenException('You must be a project member to view analytics');
    }
  }

  private async projectTasks(userId: string, organizationId: string, projectId: string) {
    const role = await this.role(userId, organizationId);
    await this.projectAccess(userId, organizationId, projectId, role);
    return this.prisma.task.findMany({
      where: { organizationId, projectId, deletedAt: null },
      select: {
        id: true, parentId: true, status: true, dueDate: true, assigneeId: true,
        checklistItems: { select: { completed: true } },
      },
    });
  }

  async taskProgress(userId: string, organizationId: string, taskId: string) {
    const role = await this.role(userId, organizationId);
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, organizationId, deletedAt: null },
      select: { id: true, projectId: true, parentId: true, status: true, checklistItems: { select: { completed: true } } },
    });
    if (!task) throw new NotFoundException('Task not found');
    await this.projectAccess(userId, organizationId, task.projectId, role);
    const children = task.parentId ? [] : await this.prisma.task.findMany({
      where: { parentId: taskId, organizationId, projectId: task.projectId, deletedAt: null },
      select: { status: true },
    });
    return calculateTaskProgress(task, children);
  }

  async projectProgress(userId: string, organizationId: string, projectId: string) {
    const tasks = await this.projectTasks(userId, organizationId, projectId);
    return { projectId, ...calculateProjectProgress(tasks) };
  }

  async employeeAnalytics(userId: string, organizationId: string, employeeId: string, projectId?: string) {
    const role = await this.role(userId, organizationId);
    if (role === Role.EMPLOYEE && employeeId !== userId) {
      throw new ForbiddenException('Employees can view only their own analytics');
    }
    if (projectId) await this.projectAccess(userId, organizationId, projectId, role);
    if (employeeId !== userId) {
      const target = await this.prisma.organizationMember.findFirst({
        where: { userId: employeeId, organizationId }, select: { id: true },
      });
      if (!target) throw new NotFoundException('Employee not found');
    }
    const tasks = await this.prisma.task.findMany({
      where: {
        organizationId, deletedAt: null, assigneeId: employeeId,
        ...(projectId ? { projectId } : {}),
        ...(role === Role.ADMIN ? {} : { project: { members: { some: { userId, organizationId } } } }),
      },
      select: { id: true, projectId: true, project: { select: { name: true } }, status: true, dueDate: true },
    });
    const now = new Date();
    const completedTasks = tasks.filter((task) => task.status === TaskStatus.DONE);
    const completionEvents = completedTasks.length ? await this.prisma.taskActivity.findMany({
      where: { organizationId, taskId: { in: completedTasks.map((task) => task.id) }, type: { in: ['TASK_STATUS_CHANGED', 'SUBTASK_COMPLETED', 'TASK_DEADLINE_CHANGED', 'SUBTASK_DEADLINE_CHANGED'] } },
      select: { taskId: true, type: true, details: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }) : [];
    const completedAt = new Map<string, Date>();
    for (const event of completionEvents) {
      if (event.type === 'TASK_DEADLINE_CHANGED' || event.type === 'SUBTASK_DEADLINE_CHANGED') continue;
      if (completedAt.has(event.taskId)) continue;
      const details = event.details;
      if (details && typeof details === 'object' && !Array.isArray(details) && details.new === TaskStatus.DONE) {
        completedAt.set(event.taskId, event.createdAt);
      }
    }
    let onTimeCompleted = 0;
    let lateCompleted = 0;
    let timingUnknown = 0;
    for (const task of completedTasks) {
      const when = completedAt.get(task.id);
      const deadlineChangedAfterCompletion = when && completionEvents.some((event) =>
        event.taskId === task.id && (event.type === 'TASK_DEADLINE_CHANGED' || event.type === 'SUBTASK_DEADLINE_CHANGED') && event.createdAt > when);
      if (!task.dueDate || !when || deadlineChangedAfterCompletion) timingUnknown++;
      else if (when <= task.dueDate) onTimeCompleted++;
      else lateCompleted++;
    }
    const workloads = new Map<string, { projectId: string; projectName: string; assigned: number; completed: number; overdue: number }>();
    for (const task of tasks) {
      const item = workloads.get(task.projectId) ?? { projectId: task.projectId, projectName: task.project.name, assigned: 0, completed: 0, overdue: 0 };
      item.assigned++;
      if (task.status === TaskStatus.DONE) item.completed++;
      if (task.status !== TaskStatus.DONE && task.dueDate && task.dueDate < now) item.overdue++;
      workloads.set(task.projectId, item);
    }
    return {
      employeeId, assigned: tasks.length, completed: completedTasks.length,
      pending: tasks.filter((task) => task.status === TaskStatus.TODO).length,
      inProgress: tasks.filter((task) => task.status === TaskStatus.IN_PROGRESS || task.status === TaskStatus.IN_REVIEW).length,
      overdue: tasks.filter((task) => task.status !== TaskStatus.DONE && task.dueDate && task.dueDate < now).length,
      completionRate: tasks.length ? Math.round((completedTasks.length / tasks.length) * 100) : 0,
      onTimeCompleted, lateCompleted, timingUnknown,
      workloadByProject: [...workloads.values()].sort((a, b) => a.projectName.localeCompare(b.projectName)),
    };
  }

  async projectAnalytics(userId: string, organizationId: string, projectId: string) {
    const tasks = await this.projectTasks(userId, organizationId, projectId);
    const [members, recent] = await Promise.all([
      this.prisma.projectMember.findMany({ where: { projectId, organizationId }, select: { userId: true } }),
      this.prisma.taskActivity.findMany({
        where: { organizationId, task: { projectId, organizationId } },
        select: { taskId: true, type: true, actorId: true, createdAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 10,
      }),
    ]);
    const userIds = [...new Set([...members.map((member) => member.userId), ...recent.map((event) => event.actorId)])];
    const users = userIds.length ? await this.prisma.user.findMany({
      where: { id: { in: userIds } }, select: { id: true, name: true },
    }) : [];
    const names = new Map(users.map((user) => [user.id, user.name]));
    const now = new Date();
    const progress = { projectId, ...calculateProjectProgress(tasks) };
    const roots = tasks.filter((task) => !task.parentId);
    const overdueTasks = tasks.filter((task) => task.status !== TaskStatus.DONE && task.dueDate && task.dueDate < now).length;
    return {
      progress,
      statusDistribution: Object.values(TaskStatus).map((status) => ({ status, count: tasks.filter((task) => task.status === status).length })),
      overdueTasks,
      memberWorkload: members.map((member) => {
        const assigned = tasks.filter((task) => task.assigneeId === member.userId);
        return {
          userId: member.userId, name: names.get(member.userId) ?? null,
          assigned: assigned.length,
          completed: assigned.filter((task) => task.status === TaskStatus.DONE).length,
          overdue: assigned.filter((task) => task.status !== TaskStatus.DONE && task.dueDate && task.dueDate < now).length,
        };
      }),
      recentActivity: recent.map((event) => ({ taskId: event.taskId, type: event.type, actorName: names.get(event.actorId) ?? null, createdAt: event.createdAt })),
      health: roots.length === 0 ? 'EMPTY' : overdueTasks ? 'AT_RISK' : tasks.every((task) => task.status === TaskStatus.DONE) ? 'COMPLETE' : 'ON_TRACK',
    };
  }
}
