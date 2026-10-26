import { afterAll, describe, expect, it } from 'vitest';
import { Queue } from 'bullmq';
import {
  Organization,
  PrismaClient,
  Role,
  TaskPriority,
  TaskReminderStatus,
  TaskReminderType,
  TaskStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { QueuesService } from '../queues/queues.service.js';
import { TaskReminderSchedulerService } from './task-reminder-scheduler.service.js';
import { randomUUID } from 'node:crypto';

const prisma = new PrismaService();

const queue = new Queue('taskforge', {
  connection: { host: '127.0.0.1', port: 6380 },
});

const queues = new QueuesService(queue as never);
const scheduler = new TaskReminderSchedulerService(prisma, queues);

const tag = randomUUID();
const email = `reminder-it-${tag}@example.test`;
const slug = `reminder-it-${tag}`;
let organizationId: string | undefined;
let userId: string | undefined;
let projectId: string | undefined;
let taskId: string | undefined;
let jobId: string | undefined;

describe('Task reminder PostgreSQL + Redis integration', () => {
  afterAll(async () => {
    try {
      if (jobId) {
        const job = await queue.getJob(jobId);
        if (job) await job.remove();
      }

      if (taskId) {
        await prisma.task.deleteMany({ where: { id: taskId } });
      }

      if (projectId) {
        await prisma.projectMember.deleteMany({ where: { projectId } });
        await prisma.project.deleteMany({ where: { id: projectId } });
      }

      if (organizationId) {
        await prisma.organizationMember.deleteMany({
          where: { organizationId },
        });
        await prisma.organization.deleteMany({
          where: { id: organizationId },
        });
      }

      if (userId) {
        await prisma.user.deleteMany({ where: { id: userId } });
      }
    } finally {
      await queue.close();
      await prisma.$disconnect();
    }
  });

  it('creates a reminder and notification in PostgreSQL and enqueues a real BullMQ job', async () => {
    await prisma.$connect();

    const user = await prisma.user.create({
      data: {
        name: 'Reminder Integration Test',
        email,
        passwordHash: 'integration-test-only',
      },
    });
    userId = user.id;

    const organization = await prisma.organization.create({
      data: { name: 'Reminder Integration Test', slug },
    });
    organizationId = organization.id;

    await prisma.organizationMember.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        role: Role.ADMIN,
      },
    });

    const project = await prisma.project.create({
      data: {
        organizationId: organization.id,
        name: 'Reminder Integration Project',
        createdById: user.id,
      },
    });
    projectId = project.id;

    await prisma.projectMember.create({
      data: {
        projectId: project.id,
        userId: user.id,
        organizationId: organization.id,
      },
    });

    const now = new Date();
    const dueDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const task = await prisma.task.create({
      data: {
        organizationId: organization.id,
        projectId: project.id,
        title: `Integration reminder ${tag}`,
        status: TaskStatus.TODO,
        priority: TaskPriority.MEDIUM,
        createdById: user.id,
        assigneeId: user.id,
        dueDate,
      },
    });
    taskId = task.id;

    await scheduler.scan(now);

    const reminder = await prisma.taskReminder.findUnique({
      where: {
        taskId_dueDate_recipientId_type: {
          taskId: task.id,
          dueDate,
          recipientId: user.id,
          type: TaskReminderType.DUE_24_HOURS,
        },
      },
    });

    expect(reminder).not.toBeNull();
    expect(reminder!.notificationAt).toBeInstanceOf(Date);
    expect(reminder!.emailQueuedAt).toBeInstanceOf(Date);
    expect(reminder!.emailEnqueueClaimedAt).toBeNull();
    expect(reminder!.status).toBe(TaskReminderStatus.QUEUED);

    const notification = await prisma.notification.findUnique({
      where: { taskReminderId: reminder!.id },
    });

    expect(notification).not.toBeNull();
    expect(notification!.recipientId).toBe(user.id);
    expect(notification!.taskId).toBe(task.id);

    jobId = `email-deadline-${reminder!.id}`;
    const job = await queue.getJob(jobId);

    expect(job).toBeDefined();
    expect(job!.name).toBe('send-email');
    expect(job!.data.reminderId).toBe(reminder!.id);
    expect(job!.data.to).toBe(email);
    expect(job!.data.idempotencyKey).toBe(`deadline-${reminder!.id}`);

    const state = await job!.getState();
    expect(['waiting', 'delayed', 'active']).toContain(state);
  }, 30_000);
});
