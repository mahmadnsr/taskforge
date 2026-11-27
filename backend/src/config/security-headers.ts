import helmet from 'helmet';

export function securityHeaders(isProd: boolean) {
  return helmet({
    contentSecurityPolicy: isProd
      ? undefined
      : {
          directives: {
            scriptSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
            styleSrc: [
              "'self'",
              "'unsafe-inline'",
              'https://unpkg.com',
            ],
            fontSrc: ["'self'", 'data:'],
            upgradeInsecureRequests: null,
          },
        },
  });
}
