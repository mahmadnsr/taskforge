import { afterAll, describe, expect, it } from 'vitest';
import { Queue, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import {
  Role,
  TaskPriority,
  TaskReminderStatus,
  TaskReminderType,
  TaskStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { QueuesService } from '../queues/queues.service.js';
import { QueuesProcessor } from '../queues/queues.processor.js';
import { EmailService } from '../email/email.service.js';

const prisma = new PrismaService();
const queue = new Queue('taskforge', {
  connection: {
    host: process.env.TEST_REDIS_HOST ?? '127.0.0.1',
    port: Number(process.env.TEST_REDIS_PORT ?? '6381'),
    ...(process.env.TEST_REDIS_USERNAME
      ? { username: process.env.TEST_REDIS_USERNAME }
      : {}),
    ...(process.env.TEST_REDIS_PASSWORD
      ? { password: process.env.TEST_REDIS_PASSWORD }
      : {}),
  },
});
const queues = new QueuesService(queue as never);
const emailService = new EmailService(new ConfigService(process.env));
const processor = new QueuesProcessor(emailService, prisma);

const tag = randomUUID();
const recipient = process.env.TEST_RECIPIENT!;
let userId: string | undefined;
let organizationId: string | undefined;
let projectId: string | undefined;
let taskId: string | undefined;
let reminderId: string | undefined;
let jobId: string | undefined;

describe('Real SMTP reminder delivery integration', () => {
  afterAll(async () => {
    try {
      if (jobId) {
        const job = await queue.getJob(jobId);
        if (job) {
          const state = await job.getState();
          if (state !== 'active') await job.remove();
        }
      }

      if (reminderId) {
        await prisma.notification.deleteMany({
          where: { taskReminderId: reminderId },
        });
        await prisma.taskReminder.deleteMany({
          where: { id: reminderId },
        });
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

  it('submits an email via SMTP and persists SENT in PostgreSQL', async () => {
    await prisma.$connect();

    for (const key of [
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_USER',
      'SMTP_PASS',
      'SMTP_FROM',
    ]) {
      expect(process.env[key], `${key} must be configured`).toBeTruthy();
    }

    const user = await prisma.user.create({
      data: {
        name: 'SMTP Integration Test',
        email: recipient,
        passwordHash: 'integration-test-only',
      },
    });
    userId = user.id;

    const organization = await prisma.organization.create({
      data: { name: 'SMTP Integration Test', slug: `smtp-it-${tag}` },
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
        name: 'SMTP Integration Project',
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
        title: `SMTP integration test ${tag}`,
        status: TaskStatus.TODO,
        priority: TaskPriority.MEDIUM,
        createdById: user.id,
        assigneeId: user.id,
        dueDate,
      },
    });
    taskId = task.id;

    const reminder = await prisma.taskReminder.create({
      data: {
        taskId: task.id,
        organizationId: organization.id,
        recipientId: user.id,
        type: TaskReminderType.DUE_24_HOURS,
        status: TaskReminderStatus.QUEUED,
        dueDate,
        notificationAt: now,
        emailQueuedAt: now,
      },
    });
    reminderId = reminder.id;

    const idempotencyKey = `deadline-${reminder.id}`;
    const job = await queues.enqueueEmail({
      to: recipient,
      subject: `TaskForge SMTP integration test ${tag}`,
      text: `This is a test email from TaskForge.\nTest reference: ${tag}\nNo action is required.`,
      idempotencyKey,
      reminderId: reminder.id,
    });
    jobId = String(job.id);

    const queuedJob = await queue.getJob(job.id!);
    expect(queuedJob).toBeDefined();

    // Invoke the real processor against the real BullMQ job without starting
    // the background worker, scheduler, or outbox dispatcher.
    await processor.process(
      queuedJob as Job<{
        to: string;
        subject: string;
        text: string;
        idempotencyKey: string;
        reminderId: string;
      }>,
    );

    const saved = await prisma.taskReminder.findUniqueOrThrow({
      where: { id: reminder.id },
    });

    expect(saved.status).toBe(TaskReminderStatus.SENT);
    expect(saved.emailSentAt).toBeInstanceOf(Date);
    expect(saved.sentAt).toBeInstanceOf(Date);
    expect(saved.emailProcessingAt).toBeNull();
    expect(saved.lastError).toBeNull();

    console.log(
      `SMTP accepted the test email; reminder persisted as SENT. Reference=${tag}`,
    );
  }, 45_000);
});
