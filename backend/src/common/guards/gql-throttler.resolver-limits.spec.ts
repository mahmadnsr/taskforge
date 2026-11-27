import { describe, expect, it } from 'vitest';
import { AuthResolver } from '../../auth/auth.resolver.js';
import { InvitationsResolver } from '../../organizations/invitations.resolver.js';

const THROTTLER_TTL = 'THROTTLER:TTL';
const THROTTLER_LIMIT = 'THROTTLER:LIMIT';

function getThrottleLimit(prototype: unknown, methodName: string): number | undefined {
  return Reflect.getMetadata(`${THROTTLER_LIMIT}default`, prototype[methodName]);
}

function getThrottleTtl(prototype: unknown, methodName: string): number | undefined {
  return Reflect.getMetadata(`${THROTTLER_TTL}default`, prototype[methodName]);
}

describe('Resolver rate-limit decorator metadata', () => {
  describe('AuthResolver.logout', () => {
    it('is rate limited to 5 requests per minute', () => {
      expect(getThrottleLimit(AuthResolver.prototype, 'logout')).toBe(5);
      expect(getThrottleTtl(AuthResolver.prototype, 'logout')).toBe(60_000);
    });
  });

  describe('AuthResolver.login', () => {
    it('is rate limited to 5 requests per minute', () => {
      expect(getThrottleLimit(AuthResolver.prototype, 'login')).toBe(5);
      expect(getThrottleTtl(AuthResolver.prototype, 'login')).toBe(60_000);
    });
  });

  describe('AuthResolver.register', () => {
    it('is rate limited to 5 requests per minute', () => {
      expect(getThrottleLimit(AuthResolver.prototype, 'register')).toBe(5);
      expect(getThrottleTtl(AuthResolver.prototype, 'register')).toBe(60_000);
    });
  });

  describe('AuthResolver.refresh', () => {
    it('is rate limited to 5 requests per minute', () => {
      expect(getThrottleLimit(AuthResolver.prototype, 'refresh')).toBe(5);
      expect(getThrottleTtl(AuthResolver.prototype, 'refresh')).toBe(60_000);
    });
  });

  describe('InvitationsResolver.inviteMember', () => {
    it('is rate limited to 10 requests per minute', () => {
      expect(getThrottleLimit(InvitationsResolver.prototype, 'inviteMember')).toBe(10);
      expect(getThrottleTtl(InvitationsResolver.prototype, 'inviteMember')).toBe(60_000);
    });
  });

  describe('InvitationsResolver.acceptInvitation', () => {
    it('is rate limited to 20 requests per minute', () => {
      expect(getThrottleLimit(InvitationsResolver.prototype, 'acceptInvitation')).toBe(20);
      expect(getThrottleTtl(InvitationsResolver.prototype, 'acceptInvitation')).toBe(60_000);
    });
  });
});
