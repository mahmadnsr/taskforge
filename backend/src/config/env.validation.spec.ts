import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation.js';

describe('validateEnv', () => {
  const validConfig = {
    DATABASE_URL: 'postgresql://localhost:5432/taskforge',
    DATABASE_URL_UNPOOLED: 'postgresql://localhost:5432/taskforge',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    NODE_ENV: 'test',
  };

  it('should return valid configuration', () => {
    expect(validateEnv(validConfig)).toEqual(validConfig);
  });

  it('should reject missing required variables', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: '',
        DATABASE_URL_UNPOOLED: undefined,
        JWT_ACCESS_SECRET: 'a'.repeat(32),
      }),
    ).toThrow(/DATABASE_URL is required/);
  });

  it('should reject a JWT secret shorter than 32 characters', () => {
    expect(() =>
      validateEnv({
        ...validConfig,
        JWT_ACCESS_SECRET: 'short-secret',
      }),
    ).toThrow(/JWT_ACCESS_SECRET must be at least 32 characters/);
  });

  it.each(['abc', '0', '-7', '1.5', ''])(
    'should reject invalid refresh-token TTL: "%s"',
    (ttl) => {
      expect(() =>
        validateEnv({
          ...validConfig,
          REFRESH_TOKEN_TTL_DAYS: ttl,
        }),
      ).toThrow(/REFRESH_TOKEN_TTL_DAYS must be a positive integer/);
    },
  );

  it('should accept a positive integer refresh-token TTL', () => {
    const config = {
      ...validConfig,
      REFRESH_TOKEN_TTL_DAYS: '14',
    };

    expect(validateEnv(config)).toEqual(config);
  });

  it('should allow the refresh-token TTL to be omitted', () => {
    expect(validateEnv(validConfig)).toEqual(validConfig);
  });

  it.each(['', 'invalid', '0m', '-15m', 'abc123', 123, null])(
    'should reject an invalid access-token expiry value: %s',
    (expiry) => {
      expect(() =>
        validateEnv({
          ...validConfig,
          JWT_ACCESS_EXPIRES_IN: expiry,
        }),
      ).toThrow(
        /JWT_ACCESS_EXPIRES_IN must be a positive duration/,
      );
    },
  );

  it.each(['15m', '1h', '7d', '500ms'])(
    'should accept a valid access-token expiry: %s',
    (expiry) => {
      const config = {
        ...validConfig,
        JWT_ACCESS_EXPIRES_IN: expiry,
      };

      expect(validateEnv(config)).toEqual(config);
    },
  );

  it('should reject an invalid port', () => {
    expect(() =>
      validateEnv({
        ...validConfig,
        PORT: '70000',
      }),
    ).toThrow(/PORT must be an integer between 1 and 65535/);
  });

  it('should reject an unsupported NODE_ENV', () => {
    expect(() =>
      validateEnv({
        ...validConfig,
        NODE_ENV: 'staging',
      }),
    ).toThrow(/NODE_ENV must be one of/);
  });
});