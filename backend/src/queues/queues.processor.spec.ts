import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { QueuesProcessor } from './queues.processor.js';

describe('QueuesProcessor', () => {
  let emailService: { send: ReturnType<typeof vi.fn> };
  let processor: QueuesProcessor;
  let prisma: { taskReminder: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    emailService = {
      send: vi.fn().mockResolvedValue(undefined),
    };

    prisma = {
      taskReminder: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    processor = new QueuesProcessor(
      emailService as unknown as EmailService,
      prisma as unknown as PrismaService,
    );
  });

  it('processes test jobs', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await processor.process({
      id: 'test-1',
      name: 'test-job',
      data: { message: 'hello' },
    } as Job);

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('message=hello'),
    );
    expect(emailService.send).not.toHaveBeenCalled();

    log.mockRestore();
  });

  it('processes task events', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await processor.process({
      id: 'event-1',
      name: 'task-event',
      data: {
        eventId: 'event-1',
        organizationId: 'org-1',
        taskId: 'task-1',
        actorId: 'user-1',
        eventType: 'TASK_CREATED',
        occurredAt: '2026-10-22T00:00:00.000Z',
      },
    } as Job);

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('event=TASK_CREATED'),
    );
    expect(emailService.send).not.toHaveBeenCalled();

    log.mockRestore();
  });

  it('sends email jobs through EmailService', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await processor.process({
      id: 'email-1',
      name: 'send-email',
      data: {
        to: 'user@example.com',
        subject: 'Welcome',
        text: 'Welcome to TaskForge',
        idempotencyKey: 'welcome-user-1',
      },
    } as Job);

    expect(emailService.send).toHaveBeenCalledWith({
      to: 'user@example.com',
      subject: 'Welcome',
      text: 'Welcome to TaskForge',
    });

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('Email sent job=email-1'),
    );

    log.mockRestore();
  });

  it('propagates email failures so BullMQ can retry', async () => {
    emailService.send.mockRejectedValueOnce(
      new Error('SMTP connection failed'),
    );

    await expect(
      processor.process({
        id: 'email-2',
        name: 'send-email',
        data: {
          to: 'user@example.com',
          subject: 'Welcome',
          text: 'Welcome',
          idempotencyKey: 'welcome-user-2',
        },
      } as Job),
    ).rejects.toThrow('SMTP connection failed');
  });

  it('rejects unknown job types', async () => {
    await expect(
      processor.process({
        id: 'unknown-1',
        name: 'unknown-job',
        data: {},
      } as Job),
    ).rejects.toThrow('Unknown job type: unknown-job');
  });
});
