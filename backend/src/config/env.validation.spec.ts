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
      ).toThrow(/JWT_ACCESS_EXPIRES_IN must be a positive duration/);
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

  it('should reject an invalid application port', () => {
    expect(() =>
      validateEnv({
        ...validConfig,
        PORT: '70000',
      }),
    ).toThrow(/PORT must be an integer between 1 and 65535/);
  });

  it.each(['0', '-1', '65536', '1.5', '', 'abc'])(
    'should reject an invalid Redis port: %s',
    (port) => {
      expect(() =>
        validateEnv({
          ...validConfig,
          REDIS_PORT: port,
        }),
      ).toThrow(/REDIS_PORT must be an integer between 1 and 65535/);
    },
  );

  it('should accept a valid Redis port', () => {
    const config = {
      ...validConfig,
      REDIS_PORT: '6380',
    };

    expect(validateEnv(config)).toEqual(config);
  });

  it.each([
    'REDIS_HOST',
    'REDIS_USERNAME',
    'REDIS_PASSWORD',
  ] as const)(
    'should reject a blank %s when provided',
    (key) => {
      expect(() =>
        validateEnv({
          ...validConfig,
          [key]: '  ',
        }),
      ).toThrow(new RegExp(`${key} must be a non-empty string`));
    },
  );

  it.each(['yes', '1', '', 'TRUE'])(
    'should reject invalid REDIS_TLS value: %s',
    (value) => {
      expect(() =>
        validateEnv({
          ...validConfig,
          REDIS_TLS: value,
        }),
      ).toThrow(/REDIS_TLS must be either true or false/);
    },
  );

  it.each(['true', 'false'])(
    'should accept REDIS_TLS value: %s',
    (value) => {
      const config = {
        ...validConfig,
        REDIS_TLS: value,
      };

      expect(validateEnv(config)).toEqual(config);
    },
  );

  it('should reject an unsupported NODE_ENV', () => {
    expect(() =>
      validateEnv({
        ...validConfig,
        NODE_ENV: 'staging',
      }),
    ).toThrow(/NODE_ENV must be one of/);
  });

  // CORS validation

  it.each([
    'https://app.example.com',
    'http://localhost:5173',
    'https://app.example.com, https://admin.example.com',
  ])('should accept valid CORS origins: %s', (origins) => {
    const config = {
      ...validConfig,
      CORS_ORIGINS: origins,
    };

    expect(validateEnv(config)).toEqual(config);
  });

  it.each([
    '*',
    'not-a-url',
    'https://example.com/path',
    'https://example.com/',
    'ftp://example.com',
    'https://one.example.com,',
  ])('should reject invalid CORS origins: %s', (origins) => {
    expect(() =>
      validateEnv({
        ...validConfig,
        CORS_ORIGINS: origins,
      }),
    ).toThrow(
      /CORS_ORIGINS must contain only valid HTTP\/HTTPS origins/,
    );
  });

  it('should allow CORS_ORIGINS to be omitted outside production', () => {
    expect(validateEnv(validConfig)).toEqual(validConfig);
  });

  it('should reject missing CORS_ORIGINS in production', () => {
    expect(() =>
      validateEnv({
        ...validConfig,
        NODE_ENV: 'production',
      }),
    ).toThrow(/CORS_ORIGINS is required in production/);
  });

  it('should reject empty CORS_ORIGINS in production', () => {
    expect(() =>
      validateEnv({
        ...validConfig,
        NODE_ENV: 'production',
        CORS_ORIGINS: '  ',
      }),
    ).toThrow(/CORS_ORIGINS is required in production/);
  });

  it('should accept configured CORS_ORIGINS in production', () => {
    const config = {
      ...validConfig,
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://app.example.com',
      METRICS_ACCESS_TOKEN: 'm'.repeat(32),
    };

    expect(validateEnv(config)).toEqual(config);
  });

  // FRONTEND_URL validation

  it('should accept a valid frontend base URL', () => {
    const config = {
      ...validConfig,
      FRONTEND_URL: 'http://localhost:5173',
    };

    expect(validateEnv(config)).toEqual(config);
  });

  it.each([
    'not-a-url',
    'https://example.com/',
    'https://example.com/path',
    'ftp://example.com',
  ])('should reject an invalid frontend base URL: %s', (url) => {
    expect(() =>
      validateEnv({
        ...validConfig,
        FRONTEND_URL: url,
      }),
    ).toThrow(/FRONTEND_URL must be/);
  });

  it('should reject an empty frontend URL when provided', () => {
    expect(() =>
      validateEnv({
        ...validConfig,
        FRONTEND_URL: '  ',
      }),
    ).toThrow(/FRONTEND_URL must be/);
  });

  it('should allow FRONTEND_URL to be omitted', () => {
    expect(validateEnv(validConfig)).toEqual(validConfig);
  });

  it('should reject HTTP frontend URLs in production', () => {
    expect(() =>
      validateEnv({
        ...validConfig,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://app.example.com',
        FRONTEND_URL: 'http://app.example.com',
      }),
    ).toThrow(/production requires HTTPS/);
  });

  it('should accept HTTPS frontend URLs in production', () => {
    const config = {
      ...validConfig,
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://app.example.com',
      FRONTEND_URL: 'https://app.example.com',
      METRICS_ACCESS_TOKEN: 'm'.repeat(32),
    };

    expect(validateEnv(config)).toEqual(config);
  });

  it('should require a separate metrics token in production', () => {
    expect(() => validateEnv({
      ...validConfig,
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://app.example.com',
    })).toThrow(/METRICS_ACCESS_TOKEN is required in production/);
  });

  it.each(['short', 'x'.repeat(31), `x${'y'.repeat(31)}\n`])(
    'should reject an invalid metrics token: %s',
    (value) => {
      expect(() => validateEnv({ ...validConfig, METRICS_ACCESS_TOKEN: value }))
        .toThrow(/METRICS_ACCESS_TOKEN/);
    },
  );

  // TRUST_PROXY validation

  it('should allow TRUST_PROXY to be omitted', () => {
    expect(validateEnv(validConfig)).toEqual(validConfig);
  });

  it.each(['loopback', '127.0.0.1', '::ffff:127.0.0.1'])(
    'should accept valid TRUST_PROXY value: %s',
    (value) => {
      const config = {
        ...validConfig,
        TRUST_PROXY: value,
      };

      expect(validateEnv(config)).toEqual(config);
    },
  );

  it.each([
    '10.0.0.0/8',
    '172.16.0.0/12,10.0.0.0/8',
    '192.168.1.1, 10.0.0.1',
  ])('should accept valid TRUST_PROXY IP/CIDR value: %s', (value) => {
    const config = {
      ...validConfig,
      TRUST_PROXY: value,
    };

    expect(validateEnv(config)).toEqual(config);
  });

  it.each(['true', '*', '', '  ', 'not-an-ip', '10.0.0.0/8, *'])(
    'should reject invalid TRUST_PROXY value: %s',
    (value) => {
      expect(() =>
        validateEnv({
          ...validConfig,
          TRUST_PROXY: value,
        }),
      ).toThrow(/TRUST_PROXY/);
    },
  );
});
