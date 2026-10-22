import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { MarkAllNotificationsReadInput } from './dto/mark-all-notifications-read.input.js';
import { MarkNotificationReadInput } from './dto/mark-notification-read.input.js';
import { NotificationsPaginationInput } from './dto/notifications-pagination.input.js';
import { Notification } from './entities/notification.entity.js';
import { NotificationsPage } from './entities/notifications-page.entity.js';
import { NotificationsService } from './notifications.service.js';

@Resolver(() => Notification)
@UseGuards(JwtAuthGuard)
export class NotificationsResolver {
  constructor(
    private readonly notificationsService: NotificationsService,
  ) {}

  @Query(() => NotificationsPage, { name: 'myNotifications' })
  myNotifications(
    @CurrentUser() user: { id: string },
    @Args('input') input: NotificationsPaginationInput,
  ) {
    return this.notificationsService.findMyNotifications(user.id, input);
  }

  @Query(() => Int, { name: 'unreadNotificationCount' })
  unreadNotificationCount(
    @CurrentUser() user: { id: string },
    @Args('organizationId', { type: () => String }) organizationId: string,
  ) {
    return this.notificationsService.unreadCount(user.id, organizationId);
  }

  @Mutation(() => Notification, { name: 'markNotificationAsRead' })
  markNotificationAsRead(
    @CurrentUser() user: { id: string },
    @Args('input') input: MarkNotificationReadInput,
  ) {
    return this.notificationsService.markAsRead(user.id, input);
  }

  @Mutation(() => Int, { name: 'markAllNotificationsAsRead' })
  markAllNotificationsAsRead(
    @CurrentUser() user: { id: string },
    @Args('input') input: MarkAllNotificationsReadInput,
  ) {
    return this.notificationsService.markAllAsRead(user.id, input);
  }
}
