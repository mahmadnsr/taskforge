import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { NotificationsResolver } from './notifications.resolver.js';
import { NotificationsService } from './notifications.service.js';
import { NotificationsStreamController } from './notifications-stream.controller.js';

@Module({
  imports: [PrismaModule],
  providers: [NotificationsResolver, NotificationsService],
  controllers: [NotificationsStreamController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
