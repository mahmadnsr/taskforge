import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { QueuesModule } from '../queues/queues.module.js';
import { TaskReminderSchedulerService } from './task-reminder-scheduler.service.js';

@Module({
  imports: [PrismaModule, QueuesModule],
  providers: [TaskReminderSchedulerService],
})
export class TaskRemindersModule {}
