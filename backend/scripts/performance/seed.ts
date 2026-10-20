import { randomUUID } from 'node:crypto';
import {
  PrismaClient,
  ProjectStatus,
  Role,
  TaskPriority,
  TaskStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

const CONFIG = {
  organizationCount: 3,
  usersPerOrganization: 10,
  projectsPerOrganization: 10,
  tasksPerProject: 100,
  commentsPerTask: 1,
};

const PASSWORD_HASH_PLACEHOLDER = 'performance-test-not-for-login';

function pick<T>(items: readonly T[], index: number): T {
  return items[index % items.length]!;
}

async function main() {
  // Safety guard: this script must only target the local performance DB.
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required.');
  }

  const url = new URL(databaseUrl);

  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== '127.0.0.1' ||
    url.port !== '5433' ||
    url.pathname !== '/taskforge_performance' ||
    decodeURIComponent(url.username) !== 'taskforge_perf'
  ) {
    throw new Error(
      'Safety check failed: seed.ts only permits the local taskforge_performance database on 127.0.0.1:5433.',
    );
  }

  await prisma.$transaction(
    async (tx) => {
      const existingCounts = await Promise.all([
        tx.organization.count(),
        tx.user.count(),
        tx.organizationMember.count(),
        tx.organizationInvitation.count(),
        tx.refreshToken.count(),
        tx.project.count(),
        tx.projectMember.count(),
        tx.task.count(),
        tx.taskComment.count(),
      ]);

      if (existingCounts.some((count) => count !== 0)) {
        throw new Error(
          `Refusing to seed a non-empty database. Existing counts: ${existingCounts.join(', ')}`,
        );
      }

      console.log('Safety checks passed. Creating synthetic benchmark data...');

      const organizations = Array.from(
        { length: CONFIG.organizationCount },
        (_, index) => ({
          id: randomUUID(),
          name: `Performance Organization ${index + 1}`,
          slug: `performance-org-${index + 1}`,
        }),
      );

      await tx.organization.createMany({ data: organizations });

      const allUsers: Array<{
        id: string;
        name: string;
        email: string;
        passwordHash: string;
      }> = [];

      const memberships: Array<{
        id: string;
        userId: string;
        organizationId: string;
        role: Role;
      }> = [];

      for (const [orgIndex, organization] of organizations.entries()) {
        for (
          let userIndex = 0;
          userIndex < CONFIG.usersPerOrganization;
          userIndex++
        ) {
          const userId = randomUUID();

          allUsers.push({
            id: userId,
            name: `Perf User ${orgIndex + 1}-${userIndex + 1}`,
            email: `perf-user-${orgIndex + 1}-${userIndex + 1}@example.test`,
            passwordHash: PASSWORD_HASH_PLACEHOLDER,
          });

          memberships.push({
            id: randomUUID(),
            userId,
            organizationId: organization.id,
            role: userIndex === 0 ? Role.ADMIN : Role.EMPLOYEE,
          });
        }
      }

      await tx.user.createMany({ data: allUsers });
      await tx.organizationMember.createMany({ data: memberships });

      const projects: Array<{
        id: string;
        organizationId: string;
        name: string;
        description: string;
        status: ProjectStatus;
        createdById: string;
      }> = [];

      const projectMemberships: Array<{
        id: string;
        projectId: string;
        userId: string;
        organizationId: string;
      }> = [];

      for (const organization of organizations) {
        const orgUsers = memberships.filter(
          (membership) => membership.organizationId === organization.id,
        );

        for (
          let projectIndex = 0;
          projectIndex < CONFIG.projectsPerOrganization;
          projectIndex++
        ) {
          const projectId = randomUUID();

          projects.push({
            id: projectId,
            organizationId: organization.id,
            name: `Performance Project ${projectIndex + 1}`,
            description: `Synthetic benchmark project ${projectIndex + 1}`,
            status: ProjectStatus.ACTIVE,
            createdById: orgUsers[0]!.userId,
          });

          for (const membership of orgUsers) {
            projectMemberships.push({
              id: randomUUID(),
              projectId,
              userId: membership.userId,
              organizationId: organization.id,
            });
          }
        }
      }

      await tx.project.createMany({ data: projects });
      await tx.projectMember.createMany({ data: projectMemberships });

      const taskStatuses = [
        TaskStatus.TODO,
        TaskStatus.IN_PROGRESS,
        TaskStatus.IN_REVIEW,
        TaskStatus.DONE,
      ] as const;

      const taskPriorities = [
        TaskPriority.LOW,
        TaskPriority.MEDIUM,
        TaskPriority.HIGH,
        TaskPriority.URGENT,
      ] as const;

      const projectMemberLookup = new Map<string, string[]>();

      for (const project of projects) {
        projectMemberLookup.set(
          project.id,
          projectMemberships
            .filter((membership) => membership.projectId === project.id)
            .map((membership) => membership.userId),
        );
      }

      const tasks: Array<{
        id: string;
        organizationId: string;
        projectId: string;
        title: string;
        description: string;
        status: TaskStatus;
        priority: TaskPriority;
        createdById: string;
        assigneeId: string | null;
        dueDate: Date | null;
        createdAt: Date;
        updatedAt: Date;
      }> = [];

      for (const project of projects) {
        const orgUsers = memberships.filter(
          (membership) => membership.organizationId === project.organizationId,
        );
        const projectUsers = projectMemberLookup.get(project.id)!;

        for (
          let taskIndex = 0;
          taskIndex < CONFIG.tasksPerProject;
          taskIndex++
        ) {
          const createdAt = new Date(
            Date.UTC(2025, 0, 1) + (tasks.length + 1) * 60_000,
          );

          tasks.push({
            id: randomUUID(),
            organizationId: project.organizationId,
            projectId: project.id,
            title: `Synthetic task ${tasks.length + 1}`,
            description:
              tasks.length % 10 === 0
                ? `Performance search marker synthetic task ${tasks.length + 1}`
                : `Generated description for task ${tasks.length + 1}`,
            status: pick(taskStatuses, tasks.length),
            priority: pick(taskPriorities, tasks.length),
            createdById: pick(orgUsers, tasks.length).userId,
            assigneeId:
              tasks.length % 5 === 0 ? null : pick(projectUsers, tasks.length),
            dueDate:
              tasks.length % 7 === 0
                ? null
                : new Date(Date.UTC(2027, 0, 1) + tasks.length * 86_400_000),
            createdAt,
            updatedAt: createdAt,
          });
        }
      }

      // Insert in batches to avoid oversized database requests.
      for (let index = 0; index < tasks.length; index += 500) {
        await tx.task.createMany({
          data: tasks.slice(index, index + 500),
        });
      }

      const taskComments: Array<{
        id: string;
        organizationId: string;
        taskId: string;
        authorId: string;
        content: string;
        createdAt: Date;
        updatedAt: Date;
      }> = [];

      for (const task of tasks) {
        const orgUsers = memberships.filter(
          (membership) => membership.organizationId === task.organizationId,
        );

        for (
          let commentIndex = 0;
          commentIndex < CONFIG.commentsPerTask;
          commentIndex++
        ) {
          const createdAt = new Date(
            task.createdAt.getTime() + (commentIndex + 1) * 1_000,
          );

          taskComments.push({
            id: randomUUID(),
            organizationId: task.organizationId,
            taskId: task.id,
            authorId: pick(orgUsers, commentIndex).userId,
            content: `Synthetic benchmark comment for task ${task.id}`,
            createdAt,
            updatedAt: createdAt,
          });
        }
      }

      for (let index = 0; index < taskComments.length; index += 500) {
        await tx.taskComment.createMany({
          data: taskComments.slice(index, index + 500),
        });
      }

      console.log(
        'Synthetic benchmark data prepared; transaction is committing.',
      );
    },
    { maxWait: 10_000, timeout: 120_000 },
  );

  await prisma.$executeRawUnsafe('ANALYZE "Task"');
  await prisma.$executeRawUnsafe('ANALYZE "TaskComment"');

  const finalCounts = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
    prisma.organizationMember.count(),
    prisma.project.count(),
    prisma.projectMember.count(),
    prisma.task.count(),
    prisma.taskComment.count(),
  ]);

  const expectedCounts = [3, 30, 30, 30, 300, 3000, 3000];

  if (finalCounts.some((count, index) => count !== expectedCounts[index])) {
    throw new Error(
      `Post-seed verification failed. Actual counts: ${finalCounts.join(', ')}`,
    );
  }

  console.log('Synthetic benchmark data created and verified successfully.');
  console.table({
    organizations: finalCounts[0],
    users: finalCounts[1],
    organizationMemberships: finalCounts[2],
    projects: finalCounts[3],
    projectMemberships: finalCounts[4],
    tasks: finalCounts[5],
    comments: finalCounts[6],
  });
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
