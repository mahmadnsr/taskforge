import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
// GraphQL context ka fake version: guard sirf getArgs()[2].req padhta hai


function makeContext(req: Record<string, unknown>) {
    return {
      getType: () => 'graphql',
      getArgs: () => [null, {}, { req }, {}],
      getHandler: () => () => undefined,
      getClass: () => class {},
    } as unknown as ExecutionContext;
  }

  
describe('RolesGuard', () => {
  const findUnique = vi.fn();
  const getAllAndOverride = vi.fn();
  const prisma = { organizationMember: { findUnique } } as unknown as PrismaService;
  const reflector = { getAllAndOverride } as unknown as Reflector;

  let guard: RolesGuard;

  beforeEach(() => {
    vi.resetAllMocks();
    guard = new RolesGuard(reflector, prisma);
  });

  it('rejects when there is no authenticated user', async () => {
    const ctx = makeContext({ headers: { 'x-organization-id': 'org-1' } });
    await expect(guard.canActivate(ctx)).rejects.toThrow('Authentication required');
  });

  it('rejects when x-organization-id header is missing', async () => {
    const ctx = makeContext({ user: { id: 'u1' }, headers: {} });
    await expect(guard.canActivate(ctx)).rejects.toThrow('Missing x-organization-id header');
  });

  it('rejects a user who is not a member of the organization (tenant isolation)', async () => {
    findUnique.mockResolvedValue(null);
    const ctx = makeContext({
      user: { id: 'u1' },
      headers: { 'x-organization-id': 'other-org' },
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      'You are not a member of this organization',
    );
  });

  it('rejects when the member role is not allowed', async () => {
    findUnique.mockResolvedValue({ role: Role.EMPLOYEE });
    getAllAndOverride.mockReturnValue([Role.ADMIN]);
    const ctx = makeContext({
      user: { id: 'u1' },
      headers: { 'x-organization-id': 'org-1' },
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow('Insufficient role');
  });

  it('allows an ADMIN and attaches membership to the request', async () => {
    findUnique.mockResolvedValue({ role: Role.ADMIN });
    getAllAndOverride.mockReturnValue([Role.ADMIN]);
    const req: Record<string, unknown> = {
      user: { id: 'u1' },
      headers: { 'x-organization-id': 'org-1' },
    };

    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect(req.membership).toEqual({ organizationId: 'org-1', role: Role.ADMIN });
    expect(findUnique).toHaveBeenCalledWith({
      where: { userId_organizationId: { userId: 'u1', organizationId: 'org-1' } },
    });
  });

  it('allows any member when no @Roles() is set', async () => {
    findUnique.mockResolvedValue({ role: Role.EMPLOYEE });
    getAllAndOverride.mockReturnValue(undefined);
    const ctx = makeContext({
      user: { id: 'u1' },
      headers: { 'x-organization-id': 'org-1' },
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('throws ForbiddenException (403) not a generic error', async () => {
    findUnique.mockResolvedValue(null);
    const ctx = makeContext({
      user: { id: 'u1' },
      headers: { 'x-organization-id': 'x' },
    });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });
});