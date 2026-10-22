import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { MarkAllNotificationsReadInput } from './dto/mark-all-notifications-read.input.js';
import { MarkNotificationReadInput } from './dto/mark-notification-read.input.js';
import { NotificationsPaginationInput } from './dto/notifications-pagination.input.js';
import {
  decodeNotificationCursor,
  encodeNotificationCursor,
} from './notifications-cursor.js';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createForRecipient(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      recipientId: string;
      taskId: string;
      type: NotificationType;
      message: string;
    },
  ) {
    const {
      organizationId,
      recipientId,
      taskId,
      type,
      message,
    } = input;

    const membership = await tx.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: recipientId,
          organizationId,
        },
      },
      select: { userId: true },
    });

    if (!membership) {
      throw new ForbiddenException(
        'Notification recipient must belong to the organization',
      );
    }

    return tx.notification.create({
      data: {
        organizationId,
        recipientId,
        taskId,
        type,
        message,
      },
    });
  }

  private async assertOrganizationMembership(
    userId: string,
    organizationId: string,
  ) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: { userId, organizationId },
      },
      select: { userId: true },
    });

    if (!membership) {
      throw new ForbiddenException(
        'You are not a member of this organization',
      );
    }
  }

  async findMyNotifications(
    userId: string,
    input: NotificationsPaginationInput,
  ) {
    const { organizationId, first, after } = input;

    await this.assertOrganizationMembership(userId, organizationId);

    const cursor = after ? decodeNotificationCursor(after) : null;

    const notifications = await this.prisma.notification.findMany({
      where: {
        recipientId: userId,
        organizationId,
        ...(cursor && {
          OR: [
            { createdAt: { lt: new Date(cursor.createdAt) } },
            {
              createdAt: new Date(cursor.createdAt),
              id: { lt: cursor.id },
            },
          ],
        }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: first + 1,
    });

    const hasMore = notifications.length > first;
    const items = notifications.slice(0, first);
    const lastItem = items.at(-1);

    return {
      items,
      hasMore,
      nextCursor:
        hasMore && lastItem
          ? encodeNotificationCursor({
              createdAt: lastItem.createdAt.toISOString(),
              id: lastItem.id,
            })
          : null,
    };
  }

  async unreadCount(userId: string, organizationId: string) {
    await this.assertOrganizationMembership(userId, organizationId);

    return this.prisma.notification.count({
      where: {
        recipientId: userId,
        organizationId,
        readAt: null,
      },
    });
  }

  async markAsRead(
    userId: string,
    input: MarkNotificationReadInput,
  ) {
    const { organizationId, notificationId } = input;

    await this.assertOrganizationMembership(userId, organizationId);

    const result = await this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        recipientId: userId,
        organizationId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    if (result.count === 0) {
      const notification = await this.prisma.notification.findFirst({
        where: {
          id: notificationId,
          recipientId: userId,
          organizationId,
        },
        select: { id: true },
      });

      if (!notification) {
        throw new NotFoundException('Notification not found');
      }
    }

    return this.prisma.notification.findFirstOrThrow({
      where: {
        id: notificationId,
        recipientId: userId,
        organizationId,
      },
    });
  }

  async markAllAsRead(
    userId: string,
    input: MarkAllNotificationsReadInput,
  ) {
    const { organizationId } = input;

    await this.assertOrganizationMembership(userId, organizationId);

    const result = await this.prisma.notification.updateMany({
      where: {
        recipientId: userId,
        organizationId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    return result.count;
  }
}
