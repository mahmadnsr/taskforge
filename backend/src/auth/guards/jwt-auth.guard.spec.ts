import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard.js';

function makeContext(req: Record<string, any>) {
  return {
    getType: () => 'graphql',
    getArgs: () => [null, {}, { req }, {}],
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const verifyAsync = vi.fn();
  const jwt = { verifyAsync } as unknown as JwtService;

  let guard: JwtAuthGuard;

  beforeEach(() => {
    vi.resetAllMocks();
    guard = new JwtAuthGuard(jwt);
  });

  it('allows a valid Bearer token and attaches the user to the request', async () => {
    verifyAsync.mockResolvedValue({ sub: 'u1' });

    const req: Record<string, any> = {
      headers: { authorization: 'Bearer valid-token' },
    };

    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);

    expect(req.user).toEqual({ id: 'u1' });
    expect(verifyAsync).toHaveBeenCalledWith('valid-token');
  });

  it('rejects when the authorization header is missing', async () => {
    const req = { headers: {} };

    await expect(
      guard.canActivate(makeContext(req)),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects when the authorization header is undefined', async () => {
    const req = {};

    await expect(
      guard.canActivate(makeContext(req)),
    ).rejects.toThrow('Missing access token');

    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects a non-Bearer authorization scheme', async () => {
    const req = {
      headers: { authorization: 'Basic abc123' },
    };

    await expect(
      guard.canActivate(makeContext(req)),
    ).rejects.toThrow('Missing access token');

    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects when the token is missing', async () => {
    const req = {
      headers: { authorization: 'Bearer' },
    };

    await expect(
      guard.canActivate(makeContext(req)),
    ).rejects.toThrow('Missing access token');

    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects malformed authorization headers', async () => {
    const req = {
      headers: { authorization: 'Bearer token extra' },
    };

    await expect(
      guard.canActivate(makeContext(req)),
    ).rejects.toThrow('Invalid or expired access token');

    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects invalid or expired tokens', async () => {
    verifyAsync.mockRejectedValue(new Error('Token expired'));

    const req = {
      headers: { authorization: 'Bearer expired-token' },
    };

    await expect(
      guard.canActivate(makeContext(req)),
    ).rejects.toThrow('Invalid or expired access token');
  });

  it('rejects a verified token with a missing sub claim', async () => {
    verifyAsync.mockResolvedValue({});

    const req = {
      headers: { authorization: 'Bearer token-without-sub' },
    };

    await expect(
      guard.canActivate(makeContext(req)),
    ).rejects.toThrow('Invalid or expired access token');
  });

  it('rejects a verified token with a non-string sub claim', async () => {
    verifyAsync.mockResolvedValue({ sub: 123 });

    const req = {
      headers: { authorization: 'Bearer token-with-invalid-sub' },
    };

    await expect(
      guard.canActivate(makeContext(req)),
    ).rejects.toThrow('Invalid or expired access token');
  });

  it('rejects a verified token with an empty sub claim', async () => {
    verifyAsync.mockResolvedValue({ sub: '   ' });

    const req = {
      headers: { authorization: 'Bearer token-with-empty-sub' },
    };

    await expect(
      guard.canActivate(makeContext(req)),
    ).rejects.toThrow('Invalid or expired access token');
  });
});