import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TaskCommentsResolver } from './task-comments.resolver.js';
import { TaskCommentsService } from './task-comments.service.js';

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [TaskCommentsService, TaskCommentsResolver],
})
export class TaskCommentsModule {}
