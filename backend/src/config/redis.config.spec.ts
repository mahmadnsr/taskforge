import { describe, expect, it, vi } from 'vitest';
import { createRedisConfig } from './redis.config.js';

function makeConfig(values: Record<string, string> = {}) {
  return {
    get: vi.fn((key: string, defaultValue?: string) => values[key] ?? defaultValue),
  };
}

describe('createRedisConfig', () => {
  it('uses local Redis defaults without optional credentials or TLS', () => {
    const config = makeConfig();

    expect(createRedisConfig(config)).toEqual({
      host: '127.0.0.1',
      port: 6379,
    });
  });

  it('uses configured host and port', () => {
    const config = makeConfig({
      REDIS_HOST: 'redis.example.com',
      REDIS_PORT: '6380',
    });

    expect(createRedisConfig(config)).toEqual({
      host: 'redis.example.com',
      port: 6380,
    });
  });

  it('includes optional Redis username and password', () => {
    const config = makeConfig({
      REDIS_USERNAME: 'taskforge',
      REDIS_PASSWORD: 'secret',
    });

    expect(createRedisConfig(config)).toMatchObject({
      username: 'taskforge',
      password: 'secret',
    });
  });

  it('enables TLS only when REDIS_TLS is true', () => {
    const config = makeConfig({ REDIS_TLS: 'true' });

    expect(createRedisConfig(config).tls).toEqual({});
  });

  it('does not enable TLS for other values', () => {
    const config = makeConfig({ REDIS_TLS: 'false' });

    expect(createRedisConfig(config).tls).toBeUndefined();
  });
});
