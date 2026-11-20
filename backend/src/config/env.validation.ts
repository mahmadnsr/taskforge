const REQUIRED = [
  'DATABASE_URL',
  'DATABASE_URL_UNPOOLED',
  'JWT_ACCESS_SECRET',
] as const;

const NODE_ENVS = ['development', 'production', 'test'];

export function validateEnv(config: Record<string, unknown>) {
  const errors: string[] = [];

  // Required environment variables
  for (const key of REQUIRED) {
    const value = config[key];

    if (typeof value !== 'string' || value.trim() === '') {
      errors.push(`${key} is required`);
    }
  }

  // JWT access-token secret
  const secret = config.JWT_ACCESS_SECRET;

  if (typeof secret === 'string' && secret.length < 32) {
    errors.push('JWT_ACCESS_SECRET must be at least 32 characters');
  }

  // Application port
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

  // CORS origins
  const corsOrigins = config.CORS_ORIGINS;

  if (
    config.NODE_ENV === 'production' &&
    (typeof corsOrigins !== 'string' || corsOrigins.trim() === '')
  ) {
    errors.push('CORS_ORIGINS is required in production');
  }

  if (corsOrigins !== undefined) {
    if (typeof corsOrigins !== 'string') {
      errors.push(
        'CORS_ORIGINS must be a comma-separated list of HTTP/HTTPS origins',
      );
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
        errors.push(
          'CORS_ORIGINS must contain only valid HTTP/HTTPS origins without paths or wildcards',
        );
      }
    }
  }

  // Frontend base URL for invitation links
  const frontendUrl = config.FRONTEND_URL;

  if (frontendUrl !== undefined) {
    if (
      typeof frontendUrl !== 'string' ||
      frontendUrl.trim() === ''
    ) {
      errors.push('FRONTEND_URL must be a valid HTTP/HTTPS base URL');
    } else {
      try {
        const url = new URL(frontendUrl);

        if (
          !['http:', 'https:'].includes(url.protocol) ||
          url.origin !== frontendUrl ||
          url.username !== '' ||
          url.password !== '' ||
          (config.NODE_ENV === 'production' &&
            url.protocol !== 'https:')
        ) {
          errors.push(
            'FRONTEND_URL must be a valid base URL without paths; production requires HTTPS',
          );
        }
      } catch {
        errors.push('FRONTEND_URL must be a valid HTTP/HTTPS base URL');
      }
    }
  }

  // Redis port
  const redisPort = config.REDIS_PORT;

  if (
    redisPort !== undefined &&
    (
      (typeof redisPort !== 'string' && typeof redisPort !== 'number') ||
      String(redisPort).trim() === '' ||
      !Number.isInteger(Number(redisPort)) ||
      Number(redisPort) < 1 ||
      Number(redisPort) > 65535
    )
  ) {
    errors.push('REDIS_PORT must be an integer between 1 and 65535');
  }

  // Redis connection settings
  for (const key of [
    'REDIS_HOST',
    'REDIS_USERNAME',
    'REDIS_PASSWORD',
  ] as const) {
    const value = config[key];

    if (
      value !== undefined &&
      (typeof value !== 'string' || value.trim() === '')
    ) {
      errors.push(`${key} must be a non-empty string when provided`);
    }
  }

  // Redis TLS
  if (
    config.REDIS_TLS !== undefined &&
    config.REDIS_TLS !== 'true' &&
    config.REDIS_TLS !== 'false'
  ) {
    errors.push('REDIS_TLS must be either true or false');
  }

  // Trusted proxy — only set when running behind a trusted reverse proxy.
  // Accepts: loopback, 127.0.0.1, ::ffff:127.0.0.1, or a comma-separated
  // list of IP addresses/CIDR ranges. Never wildcard ('*') or 'true'
  // (Express interprets 'true' as trusting every proxy hop).
  const trustProxy = config.TRUST_PROXY;

  if (trustProxy !== undefined) {
    const raw = String(trustProxy).trim();

    if (raw === '') {
      errors.push('TRUST_PROXY must not be empty when provided');
    } else if (
      raw !== 'loopback' &&
      raw !== '127.0.0.1' &&
      raw !== '::ffff:127.0.0.1' &&
      !raw.split(',').every((part) => {
        const p = part.trim();
        if (p === '' || p === '*') return false;
        // Allow IP addresses and CIDR ranges (simple validation).
        return /^[\d.a-fA-F:./]+$/.test(p);
      })
    ) {
      errors.push(
        'TRUST_PROXY must be loopback, 127.0.0.1, ::ffff:127.0.0.1, or a comma-separated list of IP addresses/CIDR ranges',
      );
    }
  }

  // Node environment
  const nodeEnv = config.NODE_ENV;

  if (
    nodeEnv !== undefined &&
    (typeof nodeEnv !== 'string' || !NODE_ENVS.includes(nodeEnv))
  ) {
    errors.push(`NODE_ENV must be one of: ${NODE_ENVS.join(', ')}`);
  }

  // Refresh-token TTL
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

  // JWT access-token expiry
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

  // Report all validation errors together
  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n- ${errors.join('\n- ')}`,
    );
  }

  return config;
}