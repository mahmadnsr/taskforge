import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { TasksService } from './tasks.service.js';

@Injectable()
export class TaskDependenciesService {
  constructor(private readonly prisma: PrismaService, private readonly tasks: TasksService) {}

  private async visibleTask(userId: string, organizationId: string, taskId: string) {
    return this.tasks.get(userId, organizationId, taskId);
  }

  private async manager(userId: string, organizationId: string, taskId: string) {
    const task = await this.visibleTask(userId, organizationId, taskId);
    const member = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId } }, select: { role: true },
    });
    if (member?.role !== Role.ADMIN && member?.role !== Role.MANAGER) {
      throw new ForbiddenException('Only admins and managers can manage task dependencies');
    }
    return task;
  }

  async list(userId: string, organizationId: string, taskId: string) {
    const task = await this.visibleTask(userId, organizationId, taskId);
    return this.prisma.taskDependency.findMany({
      where: { organizationId, projectId: task.projectId, taskId, blockingTask: { deletedAt: null } },
      include: { blockingTask: { select: { id: true, title: true, status: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async lockedProject(tx: Prisma.TransactionClient, projectId: string, organizationId: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Project" WHERE id = ${projectId} AND "organizationId" = ${organizationId} FOR UPDATE`;
    if (rows.length !== 1) throw new NotFoundException('Project not found');
  }

  async add(userId: string, organizationId: string, taskId: string, blockingTaskId: string) {
    const task = await this.manager(userId, organizationId, taskId);
    if (taskId === blockingTaskId) throw new BadRequestException('A task cannot depend on itself');
    return this.prisma.$transaction(async (tx) => {
      await this.lockedProject(tx, task.projectId, organizationId);
      const nodes = await tx.task.findMany({
        where: { id: { in: [taskId, blockingTaskId] }, organizationId, projectId: task.projectId, deletedAt: null },
        select: { id: true, status: true },
      });
      if (nodes.length !== 2) throw new NotFoundException('Task not found');
      const dependent = nodes.find((node) => node.id === taskId)!;
      const blocker = nodes.find((node) => node.id === blockingTaskId)!;
      if (dependent.status !== TaskStatus.TODO && blocker.status !== TaskStatus.DONE) {
        throw new ConflictException('Complete blocking tasks before starting work');
      }
      const edges = await tx.taskDependency.findMany({
        where: { organizationId, projectId: task.projectId },
        select: { taskId: true, blockingTaskId: true },
      });
      if (edges.some((edge) => edge.taskId === taskId && edge.blockingTaskId === blockingTaskId)) {
        throw new ConflictException('Task dependency already exists');
      }
      const graph = new Map<string, string[]>();
      for (const edge of edges) graph.set(edge.taskId, [...(graph.get(edge.taskId) ?? []), edge.blockingTaskId]);
      const visited = new Set<string>();
      const stack = [blockingTaskId];
      while (stack.length) {
        const current = stack.pop()!;
        if (current === taskId) throw new BadRequestException('Task dependency would create a cycle');
        if (visited.has(current)) continue;
        visited.add(current);
        stack.push(...(graph.get(current) ?? []));
      }
      return tx.taskDependency.create({ data: { organizationId, projectId: task.projectId, taskId, blockingTaskId } });
    });
  }

  async remove(userId: string, organizationId: string, taskId: string, blockingTaskId: string) {
    const task = await this.manager(userId, organizationId, taskId);
    const result = await this.prisma.taskDependency.deleteMany({
      where: { organizationId, projectId: task.projectId, taskId, blockingTaskId },
    });
    if (result.count !== 1) throw new NotFoundException('Task dependency not found');
    return true;
  }

}
