import { describe, it, expect, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { AppResolver } from './app.resolver.js';

describe('AppResolver', () => {
  let resolver: AppResolver;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [AppResolver],
    }).compile();
    resolver = moduleRef.get(AppResolver);
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });

  it('hello returns a string', () => {
    expect(typeof resolver.hello()).toBe('string');
  });
});