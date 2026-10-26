import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from '../config/env.validation.js';
import { QueuesModule } from './queues.module.js';
import { QueuesProcessor } from './queues.processor.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OutboxDispatcherService } from '../outbox/outbox-dispatcher.service.js';
import { EmailModule } from '../email/email.module.js';
import { TaskRemindersModule } from '../task-reminders/task-reminders.module.js';
import { WorkerHeartbeatService } from '../worker-heartbeat/worker-heartbeat.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    QueuesModule,
    PrismaModule,
    EmailModule,
    TaskRemindersModule,
  ],
  providers: [QueuesProcessor, OutboxDispatcherService, WorkerHeartbeatService],
})
export class QueuesWorkerModule {}
