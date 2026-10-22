import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { QueuesWorkerModule } from './queues/queues-worker.module.js';

async function bootstrap() {
  const logger = new Logger('TaskForgeWorker');

  const app = await NestFactory.createApplicationContext(
    QueuesWorkerModule,
    { bufferLogs: true },
  );

  app.useLogger(logger);
  logger.log('Worker started and waiting for BullMQ jobs.');

  const shutdown = async (signal: string) => {
    logger.log(`${signal} received; shutting down worker gracefully.`);
    await app.close();
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT').catch((error: unknown) => {
      logger.error('Worker shutdown failed', error);
      process.exitCode = 1;
    });
  });

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM').catch((error: unknown) => {
      logger.error('Worker shutdown failed', error);
      process.exitCode = 1;
    });
  });
}

void bootstrap().catch((error: unknown) => {
  console.error('[TaskForgeWorker] Startup failed:', error);
  process.exitCode = 1;
});
