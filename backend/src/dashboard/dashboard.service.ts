import { ForbiddenException, Injectable } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { DashboardSummary } from './entities/dashboard-summary.entity.js';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(
    userId: string,
    organizationId: string,
  ): Promise<DashboardSummary> {
    const membership = await this.prisma.organizationMember.findFirst({
      where: {
        userId,
        organizationId,
      },
      select: {
        id: true,
      },
    });

    if (!membership) {
      throw new ForbiddenException(
        'You are not a member of this organization',
      );
    }

    const now = new Date();

    const [totalProjects, taskGroups, overdueTasks] = await Promise.all([
      this.prisma.project.count({
        where: { organizationId },
      }),

      this.prisma.task.groupBy({
        by: ['status'],
        where: { organizationId },
        _count: {
          _all: true,
        },
      }),

      this.prisma.task.count({
        where: {
          organizationId,
          dueDate: {
            lt: now,
          },
          status: {
            not: TaskStatus.DONE,
          },
        },
      }),
    ]);

    const counts = new Map(
      taskGroups.map((group) => [group.status, group._count._all]),
    );

    const totalTasks = taskGroups.reduce(
      (total, group) => total + group._count._all,
      0,
    );

    return {
      totalProjects,
      totalTasks,
      pendingTasks: counts.get(TaskStatus.TODO) ?? 0,
      inProgressTasks: counts.get(TaskStatus.IN_PROGRESS) ?? 0,
      completedTasks: counts.get(TaskStatus.DONE) ?? 0,
      overdueTasks,
    };
  }
}
