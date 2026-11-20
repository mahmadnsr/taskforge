import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { QueuesModule } from '../queues/queues.module.js';
import { TasksResolver } from './tasks.resolver.js';
import { TasksService } from './tasks.service.js';
import { TaskDependenciesService } from './task-dependencies.service.js';
import { TaskDependenciesResolver } from './task-dependencies.resolver.js';

@Module({
  imports: [PrismaModule, NotificationsModule, QueuesModule],
  providers: [TasksService, TasksResolver, TaskDependenciesService, TaskDependenciesResolver],
})
export class TasksModule {}
