import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailService } from './email.service.js';

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(),
  },
}));

describe('EmailService', () => {
  let config: { get: ReturnType<typeof vi.fn> };
  let service: EmailService;
  let sendMail: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    const values: Record<string, string> = {
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
      SMTP_USER: 'test-user',
      SMTP_PASS: 'test-password',
      SMTP_FROM: 'TaskForge <noreply@example.com>',
    };

    config = {
      get: vi.fn((key: string) => values[key]),
    };

    sendMail = vi.fn().mockResolvedValue({ messageId: 'message-1' });

    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail,
    } as never);

    service = new EmailService(config as unknown as ConfigService);
  });

  it('sends an email using configured SMTP credentials', async () => {
    await service.send({
      to: 'user@example.com',
      subject: 'Welcome',
      text: 'Welcome to TaskForge',
    });

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: {
        user: 'test-user',
        pass: 'test-password',
      },
    });

    expect(sendMail).toHaveBeenCalledWith({
      from: 'TaskForge <noreply@example.com>',
      to: 'user@example.com',
      subject: 'Welcome',
      text: 'Welcome to TaskForge',
    });
  });

  it('uses Mailpit SMTP on the internal staging hostname', async () => {
    const values: Record<string, string> = {
      SMTP_HOST: 'mailpit',
      SMTP_PORT: '1025',
      SMTP_USER: 'stage_mailer',
      SMTP_PASS: 'local-test-password',
      SMTP_FROM: 'TaskForge Staging <noreply@example.test>',
    };
    config.get.mockImplementation((key: string) => values[key]);

    await service.send({
      to: 'employee@example.test',
      subject: 'Invitation',
      text: 'Join TaskForge',
    });

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'mailpit',
      port: 1025,
      secure: false,
      auth: { user: 'stage_mailer', pass: 'local-test-password' },
    });
    expect(sendMail).toHaveBeenCalledOnce();
  });

  it('reuses the SMTP transporter for subsequent emails', async () => {
    await service.send({
      to: 'first@example.com',
      subject: 'First',
      text: 'First email',
    });

    await service.send({
      to: 'second@example.com',
      subject: 'Second',
      text: 'Second email',
    });

    expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it('rejects sending when SMTP configuration is missing', async () => {
    config.get.mockImplementation((key: string) =>
      key === 'SMTP_HOST' ? undefined : 'configured-value',
    );

    await expect(
      service.send({
        to: 'user@example.com',
        subject: 'Hello',
        text: 'Hello',
      }),
    ).rejects.toThrow(
      'Email provider is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM.',
    );

    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it('rejects an invalid SMTP port', async () => {
    config.get.mockImplementation((key: string) =>
      key === 'SMTP_PORT' ? 'invalid' : ({
        SMTP_HOST: 'smtp.example.com',
        SMTP_USER: 'test-user',
        SMTP_PASS: 'test-password',
        SMTP_FROM: 'noreply@example.com',
      })[key],
    );

    await expect(
      service.send({
        to: 'user@example.com',
        subject: 'Hello',
        text: 'Hello',
      }),
    ).rejects.toThrow('SMTP_PORT must be an integer');

    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it('propagates SMTP delivery failures for BullMQ retries', async () => {
    sendMail.mockRejectedValueOnce(new Error('SMTP connection failed'));

    await expect(
      service.send({
        to: 'user@example.com',
        subject: 'Hello',
        text: 'Hello',
      }),
    ).rejects.toThrow('SMTP connection failed');
  });
});
