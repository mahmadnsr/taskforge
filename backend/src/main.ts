import { NestFactory } from '@nestjs/core';
import { SafeValidationPipe } from './common/graphql/safe-validation.js';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

  // Limit incoming request body size to 1 MB.
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  const config = app.get(ConfigService);

  const isProd = config.get<string>('NODE_ENV') === 'production';

  // Trusted proxy: only trust X-Forwarded-For from explicitly configured
  // reverse proxies. Defaults to false (secure) when TRUST_PROXY is absent.
  const trustProxy = config.get<string>('TRUST_PROXY');
  if (trustProxy) {
    const raw = trustProxy.trim();
    const expressApp = app.getHttpAdapter().getInstance();
    if (raw === 'loopback') {
      expressApp.set('trust proxy', raw);
    } else {
      expressApp.set('trust proxy', raw.split(',').map((p) => p.trim()));
    }
  }

  // Security headers. CSP dev me off, warna Apollo Sandbox page toot jata hai.
  app.use(
    helmet({
      contentSecurityPolicy: isProd ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Sirf allowed origins browser se API call kar payenge.
  const origins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-organization-id'],
    credentials: false,
  });

  app.useGlobalPipes(new SafeValidationPipe({ whitelist: true }));

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap().catch((error: unknown) => {
  if (process.env.NODE_ENV === 'production') {
    console.error('Application failed to start.');
  } else {
    console.error('Application failed to start:', error);
  }

  process.exitCode = 1;
});