import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { QueuesWorkerModule } from './queues/queues-worker.module.js';
import { StructuredLogger } from './observability/structured-logger.service.js';

const logger = new StructuredLogger('worker');

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(
    QueuesWorkerModule,
    { logger },
  );

  logger.log({ event: 'worker.started', message: 'Worker started and waiting for jobs' }, 'TaskForgeWorker');

  const shutdown = async (signal: string) => {
    logger.log({ event: 'worker.shutdown.started', message: 'Worker shutdown started', signal }, 'TaskForgeWorker');
    await app.close();
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT').catch((error: unknown) => {
      logger.error({ event: 'worker.shutdown.failed', message: 'Worker shutdown failed', error }, 'TaskForgeWorker');
      process.exitCode = 1;
    });
  });

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM').catch((error: unknown) => {
      logger.error({ event: 'worker.shutdown.failed', message: 'Worker shutdown failed', error }, 'TaskForgeWorker');
      process.exitCode = 1;
    });
  });
}

void bootstrap().catch((error: unknown) => {
  logger.fatal({ event: 'worker.startup.failed', message: 'Worker startup failed', error }, 'TaskForgeWorker');
  process.exitCode = 1;
});
