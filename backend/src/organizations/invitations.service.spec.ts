import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { InvitationsService, hashToken } from './invitations.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('InvitationsService.inviteMember', () => {
  const memberFindUnique = vi.fn();
  const memberFindFirst = vi.fn();
  const inviteFindFirst = vi.fn();
  const inviteCreate = vi.fn();
  const inviteDeleteMany = vi.fn();
  const organizationFindUnique = vi.fn();
  const configGet = vi.fn();
  const emailSend = vi.fn();

  const prisma = {
    organizationMember: {
      findUnique: memberFindUnique,
      findFirst: memberFindFirst,
    },
    organizationInvitation: {
      findFirst: inviteFindFirst,
      create: inviteCreate,
      deleteMany: inviteDeleteMany,
    },
    organization: {
      findUnique: organizationFindUnique,
    },
  } as unknown as PrismaService;

  const config = { get: configGet } as unknown as ConfigService;
  const emailService = { send: emailSend };

  let service: InvitationsService;

  const input = (over: Partial<{ email: string; role: any }> = {}) => ({
    organizationId: 'o1',
    email: 'new@test.com',
    role: 'EMPLOYEE' as any,
    ...over,
  });

  beforeEach(() => {
    vi.resetAllMocks();

    configGet.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return 'development';
      if (key === 'FRONTEND_URL') return 'http://localhost:5173';
      return undefined;
    });

    emailSend.mockResolvedValue(undefined);
    inviteDeleteMany.mockResolvedValue({ count: 1 });

    memberFindUnique.mockResolvedValue({ role: 'ADMIN' });
    memberFindFirst.mockResolvedValue(null);
    inviteFindFirst.mockResolvedValue(null);
    organizationFindUnique.mockResolvedValue({ name: 'Acme Workspace' });

    inviteCreate.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'i1',
        email: data.email,
        role: data.role,
        expiresAt: data.expiresAt,
      }),
    );

    service = new InvitationsService(prisma, config, emailService as any);
  });

  it('ADMIN can invite any role', async () => {
    const res = await service.inviteMember('u1', input({ role: 'ADMIN' }));
    expect(res.role).toBe('ADMIN');
    expect(emailSend).toHaveBeenCalledOnce();
  });

  it('MANAGER can invite an EMPLOYEE', async () => {
    memberFindUnique.mockResolvedValue({ role: 'MANAGER' });

    const res = await service.inviteMember('u1', input({ role: 'EMPLOYEE' }));

    expect(res.role).toBe('EMPLOYEE');
    expect(emailSend).toHaveBeenCalledOnce();
  });

  it('MANAGER cannot invite MANAGER or ADMIN', async () => {
    memberFindUnique.mockResolvedValue({ role: 'MANAGER' });

    await expect(
      service.inviteMember('u1', input({ role: 'MANAGER' })),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.inviteMember('u1', input({ role: 'ADMIN' })),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(inviteCreate).not.toHaveBeenCalled();
    expect(emailSend).not.toHaveBeenCalled();
  });

  it('EMPLOYEE cannot invite', async () => {
    memberFindUnique.mockResolvedValue({ role: 'EMPLOYEE' });

    await expect(
      service.inviteMember('u1', input()),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(inviteCreate).not.toHaveBeenCalled();
    expect(emailSend).not.toHaveBeenCalled();
  });

  it('rejects non-members before creating an invitation', async () => {
    memberFindUnique.mockResolvedValue(null);

    await expect(
      service.inviteMember('u2', input()),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(memberFindFirst).not.toHaveBeenCalled();
    expect(inviteCreate).not.toHaveBeenCalled();
    expect(emailSend).not.toHaveBeenCalled();
  });

  it('rejects an email that is already a member', async () => {
    memberFindFirst.mockResolvedValue({ id: 'm9' });

    await expect(
      service.inviteMember('u1', input()),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(inviteCreate).not.toHaveBeenCalled();
    expect(emailSend).not.toHaveBeenCalled();
  });

  it('rejects when an active invitation already exists', async () => {
    inviteFindFirst.mockResolvedValue({ id: 'i0' });

    await expect(
      service.inviteMember('u1', input()),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(inviteCreate).not.toHaveBeenCalled();
    expect(emailSend).not.toHaveBeenCalled();
  });

  it('normalizes the email to lowercase', async () => {
    await service.inviteMember('u1', input({ email: '  New@Test.COM ' }));

    expect(inviteCreate.mock.calls[0][0].data.email).toBe('new@test.com');
    expect(emailSend.mock.calls[0][0].to).toBe('new@test.com');
  });

  it('stores only the token hash, never the raw token', async () => {
    const res = await service.inviteMember('u1', input());
    const data = inviteCreate.mock.calls[0][0].data;

    expect(res.inviteToken).toBeTruthy();
    expect(data.tokenHash).toBe(hashToken(res.inviteToken as string));
    expect(data.tokenHash).not.toBe(res.inviteToken);
    expect(JSON.stringify(data)).not.toContain(res.inviteToken as string);
  });

  it('sets expiry about 7 days ahead', async () => {
    const before = Date.now();

    await service.inviteMember('u1', input());

    const exp = inviteCreate.mock.calls[0][0].data.expiresAt.getTime();
    const week = 7 * 24 * 60 * 60 * 1000;

    expect(exp - before).toBeGreaterThanOrEqual(week - 1000);
    expect(exp - before).toBeLessThanOrEqual(week + 5000);
  });

  it('does not return the raw token in production', async () => {
    configGet.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return 'production';
      if (key === 'FRONTEND_URL') return 'https://app.example.com';
      return undefined;
    });

    const res = await service.inviteMember('u1', input());

    expect(res.inviteToken).toBeNull();
  });

  it('sends a professional HTML email with a clickable acceptance link', async () => {
    await service.inviteMember('u1', input());

    const email = emailSend.mock.calls[0][0];

    expect(email.to).toBe('new@test.com');
    expect(email.subject).toContain('Acme Workspace');
    expect(email.text).toContain(
      'http://localhost:5173/accept-invitation?token=',
    );
    expect(email.html).toContain('Accept Invitation');
    expect(email.html).toContain(
      'href="http://localhost:5173/accept-invitation?token=',
    );
    expect(email.html).toContain('Acme Workspace');
    expect(email.html).toContain('EMPLOYEE');
  });

  it('uses the configured staging frontend URL in invitation email links', async () => {
    configGet.mockImplementation((key: string) =>
      key === 'FRONTEND_URL' ? 'http://127.0.0.1:8088' : undefined,
    );

    const result = await service.inviteMember('u1', input());
    const sent = emailSend.mock.calls[0][0];
    const expectedLink =
      `http://127.0.0.1:8088/accept-invitation?token=${result.inviteToken}`;

    expect(sent.text).toContain(expectedLink);
    expect(sent.html).toContain(`href="${expectedLink}"`);
    expect(inviteCreate.mock.calls[0][0].data.tokenHash).toBe(
      hashToken(result.inviteToken as string),
    );
  });

  it('escapes organization names in the HTML email', async () => {
    organizationFindUnique.mockResolvedValue({
      name: '<script>alert("x")</script>',
    });

    await service.inviteMember('u1', input());

    const email = emailSend.mock.calls[0][0];

    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });

  it('deletes the pending invitation if email delivery fails', async () => {
    emailSend.mockRejectedValue(new Error('SMTP unavailable'));

    await expect(
      service.inviteMember('u1', input()),
    ).rejects.toThrow('SMTP unavailable');

    expect(inviteDeleteMany).toHaveBeenCalledWith({
      where: {
        id: 'i1',
        acceptedAt: null,
      },
    });
  });

  it('preserves the original email error if cleanup also fails', async () => {
    emailSend.mockRejectedValue(new Error('SMTP unavailable'));
    inviteDeleteMany.mockRejectedValue(new Error('Database unavailable'));

    await expect(
      service.inviteMember('u1', input()),
    ).rejects.toThrow('SMTP unavailable');
  });
});
