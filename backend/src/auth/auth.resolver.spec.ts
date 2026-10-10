import { describe, it, expect, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { AuthResolver } from './auth.resolver.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';

describe('AuthResolver', () => {
  let resolver: AuthResolver;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [AuthResolver, { provide: AuthService, useValue: {} }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({})
      .overrideGuard(RolesGuard)
      .useValue({})
      .compile();
    resolver = moduleRef.get(AuthResolver);
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });
});