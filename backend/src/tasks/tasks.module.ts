import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { TasksResolver } from './tasks.resolver.js';
import { TasksService } from './tasks.service.js';

@Module({
  imports: [PrismaModule],
  providers: [TasksService, TasksResolver],
})
export class TasksModule {}
