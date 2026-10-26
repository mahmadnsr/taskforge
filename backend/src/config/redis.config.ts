type RedisConfigReader = {
  get(key: string, defaultValue?: string): string | undefined;
};

export function createRedisConfig(config: RedisConfigReader) {
  const username = config.get('REDIS_USERNAME');
  const password = config.get('REDIS_PASSWORD');
  const tlsEnabled = config.get('REDIS_TLS') === 'true';

  return {
    host: config.get('REDIS_HOST', '127.0.0.1'),
    port: Number(config.get('REDIS_PORT', '6379')),
    ...(username ? { username } : {}),
    ...(password ? { password } : {}),
    ...(tlsEnabled ? { tls: {} } : {}),
  };
}
