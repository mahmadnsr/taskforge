import { NestFactory } from '@nestjs/core';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue, QueueEvents } from 'bullmq';
import { AppModule } from '../dist/app.module.js';

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: false,
});

const queue = app.get(getQueueToken('taskforge'));
const queueEvents = new QueueEvents('taskforge', {
  connection: {
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: Number(process.env.REDIS_PORT ?? 6379),
  },
});

const jobId = `retry-test-${Date.now()}`;

try {
  await queueEvents.waitUntilReady();

  const job = await queue.add(
    'retry-test',
    { message: 'Testing retries' },
    {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 500 },
      removeOnComplete: false,
      removeOnFail: false,
    },
  );

  console.log(`Job created: ${job.id}`);
  console.log('Waiting for retry attempts...');

  try {
    await job.waitUntilFinished(queueEvents, 15000);
  } catch {
    // Expected: the processor currently rejects unknown job types.
  }

  const finalJob = await queue.getJob(jobId);

  console.log('Final state:', await finalJob.getState());
  console.log('Attempts made:', finalJob.attemptsMade);
  console.log('Expected state: failed');
  console.log('Expected attempts: 3');

  if (
    (await finalJob.getState()) !== 'failed' ||
    finalJob.attemptsMade !== 3
  ) {
    throw new Error('Retry verification failed');
  }

  console.log('PASS: BullMQ retried the job three times.');
} finally {
  await queueEvents.close();
  await app.close();
}
