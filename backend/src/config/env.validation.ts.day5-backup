const REQUIRED = [
  'DATABASE_URL',
  'DATABASE_URL_UNPOOLED',
  'JWT_ACCESS_SECRET',
] as const;

const NODE_ENVS = ['development', 'production', 'test'];

export function validateEnv(config: Record<string, unknown>) {
  const errors: string[] = [];

  for (const key of REQUIRED) {
    const value = config[key];

    if (typeof value !== 'string' || value.trim() === '') {
      errors.push(`${key} is required`);
    }
  }

  const secret = config.JWT_ACCESS_SECRET;

  if (typeof secret === 'string' && secret.length < 32) {
    errors.push('JWT_ACCESS_SECRET must be at least 32 characters');
  }

  const port = config.PORT;

  if (
    port !== undefined &&
    (
      (typeof port !== 'string' && typeof port !== 'number') ||
      String(port).trim() === '' ||
      !Number.isInteger(Number(port)) ||
      Number(port) < 1 ||
      Number(port) > 65535
    )
  ) {
    errors.push('PORT must be an integer between 1 and 65535');
  }

  const corsOrigins = config.CORS_ORIGINS;

  if (corsOrigins !== undefined) {
    if (typeof corsOrigins !== 'string') {
      errors.push('CORS_ORIGINS must be a comma-separated list of HTTP/HTTPS origins');
    } else {
      const origins = corsOrigins.split(',').map((origin) => origin.trim());

      if (
        origins.some(
          (origin) =>
            origin === '' ||
            origin === '*' ||
            (() => {
              try {
                const url = new URL(origin);
                return (
                  !['http:', 'https:'].includes(url.protocol) ||
                  url.origin !== origin ||
                  url.username !== '' ||
                  url.password !== ''
                );
              } catch {
                return true;
              }
            })(),
        )
      ) {
        errors.push('CORS_ORIGINS must contain only valid HTTP/HTTPS origins without paths or wildcards');
      }
    }
  }

  const nodeEnv = config.NODE_ENV;

  if (
    nodeEnv !== undefined &&
    (typeof nodeEnv !== 'string' || !NODE_ENVS.includes(nodeEnv))
  ) {
    errors.push(`NODE_ENV must be one of: ${NODE_ENVS.join(', ')}`);
  }

  const refreshTokenTtl = config.REFRESH_TOKEN_TTL_DAYS;

  if (refreshTokenTtl !== undefined) {
    const days = Number(refreshTokenTtl);

    if (
      (typeof refreshTokenTtl !== 'string' &&
        typeof refreshTokenTtl !== 'number') ||
      String(refreshTokenTtl).trim() === '' ||
      !Number.isSafeInteger(days) ||
      days <= 0
    ) {
      errors.push('REFRESH_TOKEN_TTL_DAYS must be a positive integer');
    }
  }

  const accessTokenExpiresIn = config.JWT_ACCESS_EXPIRES_IN;

  if (accessTokenExpiresIn !== undefined) {
    if (
      typeof accessTokenExpiresIn !== 'string' ||
      !/^\d+(?:\.\d+)?\s*(?:ms|s|m|h|d|w|y)$/.test(
        accessTokenExpiresIn.trim(),
      ) ||
      Number.parseFloat(accessTokenExpiresIn) <= 0
    ) {
      errors.push(
        'JWT_ACCESS_EXPIRES_IN must be a positive duration such as 15m, 1h, or 7d',
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n- ${errors.join('\n- ')}`,
    );
  }

  return config;
}