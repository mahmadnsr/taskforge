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
    if (port !== undefined && Number.isNaN(Number(port))) {
      errors.push('PORT must be a number');
    }
  
    const nodeEnv = config.NODE_ENV;

    if (
      nodeEnv !== undefined &&
      (typeof nodeEnv !== 'string' || !NODE_ENVS.includes(nodeEnv))
    ) {
      errors.push(`NODE_ENV must be one of: ${NODE_ENVS.join(', ')}`);
    }
  
    if (errors.length > 0) {
      throw new Error(`Invalid environment configuration:\n- ${errors.join('\n- ')}`);
    }
  
    return config;
  }