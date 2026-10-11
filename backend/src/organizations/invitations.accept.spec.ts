import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { InvitationsService, hashToken } from './invitations.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('InvitationsService.acceptInvitation', () => {
  const userFindUnique = vi.fn();
  const inviteFindUnique = vi.fn();
  const transaction = vi.fn();
  const updateMany = vi.fn();
  const memberCreate = vi.fn();
  const orgFindUniqueOrThrow = vi.fn();

  const tx = {
    organizationInvitation: { updateMany },
    organizationMember: { create: memberCreate },
    organization: { findUniqueOrThrow: orgFindUniqueOrThrow },
  };

  const prisma = {
    user: { findUnique: userFindUnique },
    organizationInvitation: { findUnique: inviteFindUnique },
    $transaction: transaction,
  } as unknown as PrismaService;
  const config = { get: vi.fn() } as unknown as ConfigService;

  let service: InvitationsService;

  const future = () => new Date(Date.now() + 60 * 60 * 1000);
  const past = () => new Date(Date.now() - 60 * 60 * 1000);

  const validInvite = () => ({
    id: 'i1',
    organizationId: 'o1',
    email: 'new@test.com',
    role: 'EMPLOYEE',
    expiresAt: future(),
    acceptedAt: null,
  });

  beforeEach(() => {
    vi.resetAllMocks();
    userFindUnique.mockResolvedValue({ email: 'new@test.com' });
    inviteFindUnique.mockResolvedValue(validInvite());
    updateMany.mockResolvedValue({ count: 1 });
    memberCreate.mockResolvedValue({ id: 'm1' });
    orgFindUniqueOrThrow.mockResolvedValue({ id: 'o1', name: 'Org', slug: 'org' });
    transaction.mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx));
    service = new InvitationsService(prisma, config);
  });

  it('adds the user with the invited role and marks the invite accepted', async () => {
    const org = await service.acceptInvitation('u9', 'raw-token');

    expect(org).toEqual({ id: 'o1', name: 'Org', slug: 'org' });
    expect(memberCreate).toHaveBeenCalledWith({
      data: { userId: 'u9', organizationId: 'o1', role: 'EMPLOYEE' },
    });
    expect(updateMany.mock.calls[0][0].data.acceptedAt).toBeInstanceOf(Date);
  });

  it('looks the invite up by hash, never by the raw token', async () => {
    await service.acceptInvitation('u9', 'raw-token');

    expect(inviteFindUnique.mock.calls[0][0].where).toEqual({
      tokenHash: hashToken('raw-token'),
    });
  });

  it('rejects an unknown token', async () => {
    inviteFindUnique.mockResolvedValue(null);
    await expect(service.acceptInvitation('u9', 'x')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects an expired invitation', async () => {
    inviteFindUnique.mockResolvedValue({ ...validInvite(), expiresAt: past() });
    await expect(service.acceptInvitation('u9', 't')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(memberCreate).not.toHaveBeenCalled();
  });

  it('rejects an already accepted invitation (no reuse)', async () => {
    inviteFindUnique.mockResolvedValue({ ...validInvite(), acceptedAt: new Date() });
    await expect(service.acceptInvitation('u9', 't')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(memberCreate).not.toHaveBeenCalled();
  });

  it('rejects when the logged-in email does not match the invite', async () => {
    userFindUnique.mockResolvedValue({ email: 'someone-else@test.com' });
    await expect(service.acceptInvitation('u9', 't')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('matches the email case-insensitively', async () => {
    userFindUnique.mockResolvedValue({ email: ' New@Test.COM ' });
    await expect(service.acceptInvitation('u9', 't')).resolves.toBeDefined();
  });

  it('rejects when another request claimed the invite first (race)', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    await expect(service.acceptInvitation('u9', 't')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(memberCreate).not.toHaveBeenCalled();
  });

  it('returns Conflict when the user is already a member', async () => {
    memberCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(service.acceptInvitation('u9', 't')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});