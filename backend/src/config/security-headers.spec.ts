import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { securityHeaders } from './security-headers.js';

function createApp(isProd: boolean) {
  const app = express();
  app.use(securityHeaders(isProd));
  app.get('/', (_, res) => res.send('OK'));
  return app;
}

describe('HTTP security headers', () => {
  it.each([true, false])(
    'enforces essential security headers (production=%s)',
    async (isProd) => {
      const response = await request(createApp(isProd)).get('/');

      expect(response.status).toBe(200);
      expect(response.headers['content-security-policy']).toContain(
        "object-src 'none'",
      );
      expect(response.headers['content-security-policy']).toContain(
        "frame-ancestors 'self'",
      );
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    },
  );

  it('enforces strict production script policy', async () => {
    const response = await request(createApp(true)).get('/');
    const csp = String(response.headers['content-security-policy']);
    const scriptSrc = csp.split(';').find(
      (directive) => directive.trim().startsWith('script-src '),
    );

    expect(scriptSrc).toBe("script-src 'self'");
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('keeps CSP enabled during local development', async () => {
    const response = await request(createApp(false)).get('/');
    const csp = String(response.headers['content-security-policy']);

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src-attr 'none'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toContain('upgrade-insecure-requests');
  });
});
