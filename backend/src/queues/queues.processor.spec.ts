import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';
import { TaskReminderStatus, TaskStatus } from '@prisma/client';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { QueuesProcessor } from './queues.processor.js';

const createReminder = (overrides: Record<string, unknown> = {}) => {
  const dueDate = new Date('2026-10-27T12:00:00.000Z');

  return {
    id: 'reminder-1',
    organizationId: 'org-1',
    recipientId: 'user-1',
    dueDate,
    status: TaskReminderStatus.PROCESSING,
    emailProcessingAt: null as Date | null,
    emailSentAt: null as Date | null,
    task: {
      organizationId: 'org-1',
      dueDate,
      assigneeId: 'user-1',
      status: TaskStatus.TODO,
    },
    recipient: {
      email: 'user@example.com',
    },
    ...overrides,
  };
};

describe('QueuesProcessor', () => {
  let emailService: { send: ReturnType<typeof vi.fn> };
  let processor: QueuesProcessor;

  let prisma: {
    taskReminder: {
      findUnique: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    emailService = {
      send: vi.fn().mockResolvedValue(undefined),
    };

    prisma = {
      taskReminder: {
        findUnique: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    processor = new QueuesProcessor(
      emailService as unknown as EmailService,
      prisma as unknown as PrismaService,
    );
  });

  /**
   * Configure a reminder's two reads and atomic claim.
   *
   * The first read represents the initial status check.
   * The processor then atomically claims the reminder.
   * The second read returns the reminder with the captured claim timestamp.
   */
  const mockReminderFlow = (
    overrides: Record<string, unknown> = {},
  ): void => {
    let claimAt: Date | undefined;

    prisma.taskReminder.findUnique
      .mockResolvedValueOnce({
        id: 'reminder-1',
        status: TaskReminderStatus.PENDING,
        emailSentAt: null,
      })
      .mockImplementationOnce(async () =>
        createReminder({
          ...overrides,
          status: TaskReminderStatus.PROCESSING,
          emailProcessingAt: claimAt,
        }),
      );

    prisma.taskReminder.updateMany.mockImplementation(
      async (args: {
        data?: {
          status?: TaskReminderStatus;
          emailProcessingAt?: Date;
        };
      }) => {
        if (args.data?.status === TaskReminderStatus.PROCESSING) {
          claimAt = args.data.emailProcessingAt;
        }

        return { count: 1 };
      },
    );
  };

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

  it('sends normal email jobs through EmailService', async () => {
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

    expect(prisma.taskReminder.updateMany).not.toHaveBeenCalled();

    log.mockRestore();
  });

  it('propagates normal email failures so BullMQ can retry', async () => {
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

  it('sends a reminder after successfully claiming it', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    mockReminderFlow();

    await processor.process({
      id: 'email-reminder-1',
      name: 'send-email',
      data: {
        to: 'user@example.com',
        subject: 'Task reminder',
        text: 'Your task is due soon',
        idempotencyKey: 'deadline-reminder-1',
        reminderId: 'reminder-1',
      },
    } as Job);

    expect(emailService.send).toHaveBeenCalledWith({
      to: 'user@example.com',
      subject: 'Task reminder',
      text: 'Your task is due soon',
    });

    expect(prisma.taskReminder.updateMany).toHaveBeenCalledTimes(2);

    expect(prisma.taskReminder.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'reminder-1',
          emailSentAt: null,
          status: {
            in: [
              TaskReminderStatus.PENDING,
              TaskReminderStatus.QUEUED,
            ],
          },
        }),
        data: expect.objectContaining({
          status: TaskReminderStatus.PROCESSING,
          emailProcessingAt: expect.any(Date),
        }),
      }),
    );

    expect(prisma.taskReminder.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'reminder-1',
          status: TaskReminderStatus.PROCESSING,
          emailSentAt: null,
        }),
        data: expect.objectContaining({
          status: TaskReminderStatus.SENT,
          emailProcessingAt: null,
          emailSentAt: expect.any(Date),
          sentAt: expect.any(Date),
          lastError: null,
        }),
      }),
    );

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('Email sent job=email-reminder-1'),
    );

    log.mockRestore();
  });

  it('does not send an email if the claimed reminder disappears', async () => {
    let claimAt: Date | undefined;

    prisma.taskReminder.findUnique
      .mockResolvedValueOnce({
        id: 'reminder-1',
        status: TaskReminderStatus.PENDING,
        emailSentAt: null,
      })
      .mockResolvedValueOnce(null);

    prisma.taskReminder.updateMany.mockImplementation(
      async (args: {
        data?: {
          status?: TaskReminderStatus;
          emailProcessingAt?: Date;
        };
      }) => {
        if (args.data?.status === TaskReminderStatus.PROCESSING) {
          claimAt = args.data.emailProcessingAt;
        }

        return { count: 1 };
      },
    );

    const warning = vi
      .spyOn(processor['logger'], 'warn')
      .mockImplementation(() => {});

    await expect(
      processor.process({
        id: 'email-reminder-missing',
        name: 'send-email',
        data: {
          to: 'user@example.com',
          subject: 'Task reminder',
          text: 'Your task is due soon',
          idempotencyKey: 'deadline-reminder-1',
          reminderId: 'reminder-1',
        },
      } as Job),
    ).resolves.toBeUndefined();

    expect(claimAt).toBeInstanceOf(Date);
    expect(emailService.send).not.toHaveBeenCalled();
    expect(prisma.taskReminder.updateMany).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith(
      'Claimed reminder disappeared before delivery: reminder-1',
    );

    warning.mockRestore();
  });

  it('does not send an email again when the reminder is already sent', async () => {
    prisma.taskReminder.findUnique.mockResolvedValueOnce({
      id: 'reminder-1',
      status: TaskReminderStatus.SENT,
      emailSentAt: new Date('2026-10-26T12:00:00.000Z'),
    });

    await processor.process({
      id: 'email-reminder-sent',
      name: 'send-email',
      data: {
        to: 'user@example.com',
        subject: 'Task reminder',
        text: 'Your task is due soon',
        idempotencyKey: 'deadline-reminder-1',
        reminderId: 'reminder-1',
      },
    } as Job);

    expect(emailService.send).not.toHaveBeenCalled();
    expect(prisma.taskReminder.updateMany).not.toHaveBeenCalled();
    expect(prisma.taskReminder.findUnique).toHaveBeenCalledTimes(1);
  });

  it('does not send an email when another worker has claimed the reminder', async () => {
    prisma.taskReminder.findUnique.mockResolvedValueOnce({
      id: 'reminder-1',
      status: TaskReminderStatus.PENDING,
      emailSentAt: null,
    });

    prisma.taskReminder.updateMany.mockResolvedValueOnce({ count: 0 });

    await processor.process({
      id: 'email-reminder-concurrent',
      name: 'send-email',
      data: {
        to: 'user@example.com',
        subject: 'Task reminder',
        text: 'Your task is due soon',
        idempotencyKey: 'deadline-reminder-1',
        reminderId: 'reminder-1',
      },
    } as Job);

    expect(emailService.send).not.toHaveBeenCalled();
    expect(prisma.taskReminder.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.taskReminder.findUnique).toHaveBeenCalledTimes(1);
  });

  it('sends only one reminder email when two processing attempts overlap', async () => {
    let claimAt: Date | undefined;
    let claimAttempts = 0;
    let initialReads = 0;

    prisma.taskReminder.findUnique.mockImplementation(async () => {
      initialReads += 1;

      if (initialReads <= 2) {
        return {
          id: 'reminder-1',
          status: TaskReminderStatus.PENDING,
          emailSentAt: null,
        };
      }

      return createReminder({
        status: TaskReminderStatus.PROCESSING,
        emailProcessingAt: claimAt,
      });
    });

    prisma.taskReminder.updateMany.mockImplementation(async (args: {
      data?: {
        status?: TaskReminderStatus;
        emailProcessingAt?: Date;
      };
    }) => {
      if (args.data?.status === TaskReminderStatus.PROCESSING) {
        claimAttempts += 1;

        if (claimAttempts === 1) {
          claimAt = args.data.emailProcessingAt;
          return { count: 1 };
        }

        return { count: 0 };
      }

      return { count: 1 };
    });

    const job = {
      id: 'email-reminder-overlap',
      name: 'send-email',
      data: {
        to: 'user@example.com',
        subject: 'Task reminder',
        text: 'Your task is due soon',
        idempotencyKey: 'deadline-reminder-1',
        reminderId: 'reminder-1',
      },
    } as Job;

    await Promise.all([
      processor.process(job),
      processor.process(job),
    ]);

    expect(claimAttempts).toBe(2);
    expect(emailService.send).toHaveBeenCalledTimes(1);
    expect(emailService.send).toHaveBeenCalledWith({
      to: 'user@example.com',
      subject: 'Task reminder',
      text: 'Your task is due soon',
    });
  });

  it('skips a reminder when its task is already completed', async () => {
    mockReminderFlow({
      task: {
        organizationId: 'org-1',
        dueDate: new Date('2026-10-27T12:00:00.000Z'),
        assigneeId: 'user-1',
        status: TaskStatus.DONE,
      },
    });

    await processor.process({
      id: 'email-reminder-stale',
      name: 'send-email',
      data: {
        to: 'user@example.com',
        subject: 'Task reminder',
        text: 'Your task is due soon',
        idempotencyKey: 'deadline-reminder-1',
        reminderId: 'reminder-1',
      },
    } as Job);

    expect(emailService.send).not.toHaveBeenCalled();

    expect(prisma.taskReminder.updateMany).toHaveBeenCalledTimes(2);

    expect(prisma.taskReminder.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'reminder-1',
          status: TaskReminderStatus.PROCESSING,
          emailProcessingAt: expect.any(Date),
          emailSentAt: null,
        }),
        data: {
          status: TaskReminderStatus.SKIPPED,
          emailProcessingAt: null,
          lastError:
            'Task changed or reminder became stale before email delivery',
        },
      }),
    );
  });

  it('suppresses automatic retry when reminder email delivery is uncertain', async () => {
    mockReminderFlow();

    emailService.send.mockRejectedValueOnce(
      new Error('SMTP connection failed'),
    );

    await expect(
      processor.process({
        id: 'email-reminder-smtp-error',
        name: 'send-email',
        data: {
          to: 'user@example.com',
          subject: 'Task reminder',
          text: 'Your task is due soon',
          idempotencyKey: 'deadline-reminder-1',
          reminderId: 'reminder-1',
        },
      } as Job),
    ).resolves.toBeUndefined();

    expect(emailService.send).toHaveBeenCalledTimes(1);
    expect(prisma.taskReminder.updateMany).toHaveBeenCalledTimes(2);

    expect(prisma.taskReminder.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'reminder-1',
          status: TaskReminderStatus.PROCESSING,
          emailProcessingAt: expect.any(Date),
          emailSentAt: null,
        }),
        data: {
          lastError: 'Delivery outcome uncertain: SMTP connection failed',
        },
      }),
    );
  });

  it('does not propagate a database update failure after the email is sent', async () => {
    mockReminderFlow();

    prisma.taskReminder.updateMany.mockImplementation(
      async (args: {
        data?: {
          status?: TaskReminderStatus;
          emailProcessingAt?: Date;
        };
      }) => {
        if (args.data?.status === TaskReminderStatus.PROCESSING) {
          return { count: 1 };
        }

        if (args.data?.status === TaskReminderStatus.SENT) {
          throw new Error('Database unavailable');
        }

        return { count: 1 };
      },
    );

    // Keep the claim timestamp used by the second read consistent with
    // the timestamp supplied to the atomic claim.
    let claimAt: Date | undefined;

    prisma.taskReminder.updateMany.mockImplementation(
      async (args: {
        data?: {
          status?: TaskReminderStatus;
          emailProcessingAt?: Date;
        };
      }) => {
        if (args.data?.status === TaskReminderStatus.PROCESSING) {
          claimAt = args.data.emailProcessingAt;
          return { count: 1 };
        }

        if (args.data?.status === TaskReminderStatus.SENT) {
          throw new Error('Database unavailable');
        }

        return { count: 1 };
      },
    );

    prisma.taskReminder.findUnique.mockReset();

    prisma.taskReminder.findUnique
      .mockResolvedValueOnce({
        id: 'reminder-1',
        status: TaskReminderStatus.PENDING,
        emailSentAt: null,
      })
      .mockImplementationOnce(async () =>
        createReminder({
          status: TaskReminderStatus.PROCESSING,
          emailProcessingAt: claimAt,
        }),
      );

    const errorLog = vi
      .spyOn(processor['logger'], 'error')
      .mockImplementation(() => {});

    await expect(
      processor.process({
        id: 'email-reminder-db-error',
        name: 'send-email',
        data: {
          to: 'user@example.com',
          subject: 'Task reminder',
          text: 'Your task is due soon',
          idempotencyKey: 'deadline-reminder-1',
          reminderId: 'reminder-1',
        },
      } as Job),
    ).resolves.toBeUndefined();

    expect(emailService.send).toHaveBeenCalledTimes(1);
    expect(prisma.taskReminder.updateMany).toHaveBeenCalledTimes(2);

    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining(
        'Automatic retry suppressed to reduce duplicate-email risk',
      ),
      expect.any(String),
    );

    errorLog.mockRestore();
  });

  it('suppresses automatic retry when the SENT update matches no reminder', async () => {
    let claimAt: Date | undefined;

    prisma.taskReminder.findUnique
      .mockResolvedValueOnce({
        id: 'reminder-1',
        status: TaskReminderStatus.PENDING,
        emailSentAt: null,
      } as never)
      .mockImplementationOnce(async () =>
        createReminder({
          status: TaskReminderStatus.PROCESSING,
          emailProcessingAt: claimAt,
        }),
      );

    // The claim succeeds, but the final SENT update matches no rows.
    prisma.taskReminder.updateMany.mockImplementation(
      async (args: {
        data?: {
          status?: TaskReminderStatus;
          emailProcessingAt?: Date;
        };
      }) => {
        if (args.data?.status === TaskReminderStatus.PROCESSING) {
          claimAt = args.data.emailProcessingAt;
          return { count: 1 };
        }

        if (args.data?.status === TaskReminderStatus.SENT) {
          return { count: 0 };
        }

        return { count: 1 };
      },
    );

    const errorLog = vi
      .spyOn(processor['logger'], 'error')
      .mockImplementation(() => {});

    await expect(
      processor.process({
        id: 'email-reminder-zero-update',
        name: 'send-email',
        data: {
          to: 'user@example.com',
          subject: 'Task reminder',
          text: 'Your task is due soon',
          idempotencyKey: 'deadline-reminder-1',
          reminderId: 'reminder-1',
        },
      } as Job),
    ).resolves.toBeUndefined();

    expect(emailService.send).toHaveBeenCalledTimes(1);

    expect(prisma.taskReminder.updateMany).toHaveBeenCalledTimes(2);

    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining(
        'Email was accepted, but reminder success was not recorded.',
      ),
    );

    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('Automatic retry suppressed'),
    );

    errorLog.mockRestore();
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
