import { describe, expect, it, vi } from 'vitest';
import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from './notifications.service.js';
import { encodeNotificationCursor } from './notifications-cursor.js';

const ORG = 'org-1';
const USER = 'user-1';
const OTHER_USER = 'user-2';
const TASK = 'task-1';

function setup() {
  const prisma = {
    organizationMember: {
      findUnique: vi.fn().mockResolvedValue({ userId: USER }),
    },
    notification: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(3),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue({ id: 'notification-1' }),
      findFirstOrThrow: vi.fn().mockResolvedValue({
        id: 'notification-1',
        recipientId: USER,
        organizationId: ORG,
        readAt: new Date('2026-10-20T10:00:00.000Z'),
      }),
    },
  };

  const tx = {
    organizationMember: {
      findUnique: vi.fn().mockResolvedValue({ userId: OTHER_USER }),
    },
    notification: {
      create: vi.fn().mockResolvedValue({
        id: 'notification-1',
        organizationId: ORG,
        recipientId: OTHER_USER,
        taskId: TASK,
        type: NotificationType.TASK_ASSIGNED,
        message: 'You have been assigned to a task',
      }),
    },
  };

  const service = new NotificationsService(
    prisma as unknown as PrismaService,
  );

  return { service, prisma, tx };
}

describe('NotificationsService', () => {
  describe('createForRecipient', () => {
    it('creates a notification when the recipient belongs to the organization', async () => {
      const { service, tx } = setup();

      await service.createForRecipient(tx as never, {
        organizationId: ORG,
        recipientId: OTHER_USER,
        taskId: TASK,
        type: NotificationType.TASK_ASSIGNED,
        message: 'You have been assigned to a task',
      });

      expect(tx.organizationMember.findUnique).toHaveBeenCalledWith({
        where: {
          userId_organizationId: {
            userId: OTHER_USER,
            organizationId: ORG,
          },
        },
        select: { userId: true },
      });

      expect(tx.notification.create).toHaveBeenCalledWith({
        data: {
          organizationId: ORG,
          recipientId: OTHER_USER,
          taskId: TASK,
          type: NotificationType.TASK_ASSIGNED,
          message: 'You have been assigned to a task',
        },
      });
    });

    it('rejects a recipient who is not an organization member', async () => {
      const { service, tx } = setup();
      tx.organizationMember.findUnique.mockResolvedValue(null);

      await expect(
        service.createForRecipient(tx as never, {
          organizationId: ORG,
          recipientId: OTHER_USER,
          taskId: TASK,
          type: NotificationType.TASK_ASSIGNED,
          message: 'Assigned',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(tx.notification.create).not.toHaveBeenCalled();
    });
  });

  describe('findMyNotifications', () => {
    it('checks membership and filters notifications by recipient and organization', async () => {
      const { service, prisma } = setup();

      await service.findMyNotifications(USER, {
        organizationId: ORG,
        first: 10,
      });

      expect(prisma.organizationMember.findUnique).toHaveBeenCalledWith({
        where: {
          userId_organizationId: {
            userId: USER,
            organizationId: ORG,
          },
        },
        select: { userId: true },
      });

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: {
          recipientId: USER,
          organizationId: ORG,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 11,
      });
    });

    it('rejects users who are not organization members', async () => {
      const { service, prisma } = setup();
      prisma.organizationMember.findUnique.mockResolvedValue(null);

      await expect(
        service.findMyNotifications(USER, {
          organizationId: ORG,
          first: 10,
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.notification.findMany).not.toHaveBeenCalled();
    });

    it('uses the cursor timestamp and ID for stable pagination', async () => {
      const { service, prisma } = setup();
      const cursor = encodeNotificationCursor({
        createdAt: '2026-10-20T10:00:00.000Z',
        id: 'notification-5',
      });

      await service.findMyNotifications(USER, {
        organizationId: ORG,
        first: 5,
        after: cursor,
      });

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: {
          recipientId: USER,
          organizationId: ORG,
          OR: [
            { createdAt: { lt: new Date('2026-10-20T10:00:00.000Z') } },
            {
              createdAt: new Date('2026-10-20T10:00:00.000Z'),
              id: { lt: 'notification-5' },
            },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 6,
      });
    });

    it('returns a next cursor when an extra item exists', async () => {
      const { service, prisma } = setup();

      const items = Array.from({ length: 3 }, (_, index) => ({
        id: `notification-${index + 1}`,
        createdAt: new Date(`2026-10-2${index}T10:00:00.000Z`),
      }));

      prisma.notification.findMany.mockResolvedValue(items);

      const result = await service.findMyNotifications(USER, {
        organizationId: ORG,
        first: 2,
      });

      expect(result.items).toEqual(items.slice(0, 2));
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe(
        encodeNotificationCursor({
          createdAt: items[1].createdAt.toISOString(),
          id: items[1].id,
        }),
      );
    });

    it('returns a null cursor when there are no more notifications', async () => {
      const { service, prisma } = setup();
      const items = [
        {
          id: 'notification-1',
          createdAt: new Date('2026-10-20T10:00:00.000Z'),
        },
      ];

      prisma.notification.findMany.mockResolvedValue(items);

      const result = await service.findMyNotifications(USER, {
        organizationId: ORG,
        first: 10,
      });

      expect(result.items).toEqual(items);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });
  });

  describe('unreadCount', () => {
    it('counts only the current recipient unread notifications in the organization', async () => {
      const { service, prisma } = setup();

      await expect(service.unreadCount(USER, ORG)).resolves.toBe(3);

      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: {
          recipientId: USER,
          organizationId: ORG,
          readAt: null,
        },
      });
    });

    it('rejects non-members before counting notifications', async () => {
      const { service, prisma } = setup();
      prisma.organizationMember.findUnique.mockResolvedValue(null);

      await expect(service.unreadCount(USER, ORG)).rejects.toThrow(
        ForbiddenException,
      );

      expect(prisma.notification.count).not.toHaveBeenCalled();
    });
  });

  describe('markAsRead', () => {
    it('marks only the current recipient unread notification as read', async () => {
      const { service, prisma } = setup();

      await service.markAsRead(USER, {
        organizationId: ORG,
        notificationId: 'notification-1',
      });

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'notification-1',
          recipientId: USER,
          organizationId: ORG,
          readAt: null,
        },
        data: {
          readAt: expect.any(Date),
        },
      });
    });

    it('returns an already-read notification without updating it again', async () => {
      const { service, prisma } = setup();
      prisma.notification.updateMany.mockResolvedValue({ count: 0 });
      prisma.notification.findFirst.mockResolvedValue({
        id: 'notification-1',
      });

      await service.markAsRead(USER, {
        organizationId: ORG,
        notificationId: 'notification-1',
      });

      expect(prisma.notification.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'notification-1',
          recipientId: USER,
          organizationId: ORG,
        },
        select: { id: true },
      });

      expect(prisma.notification.findFirstOrThrow).toHaveBeenCalled();
    });

    it('rejects notifications that do not belong to the current recipient', async () => {
      const { service, prisma } = setup();
      prisma.notification.updateMany.mockResolvedValue({ count: 0 });
      prisma.notification.findFirst.mockResolvedValue(null);

      await expect(
        service.markAsRead(USER, {
          organizationId: ORG,
          notificationId: 'notification-owned-by-someone-else',
        }),
      ).rejects.toThrow(
        new NotFoundException('Notification not found'),
      );

      expect(prisma.notification.findFirstOrThrow).not.toHaveBeenCalled();
    });

    it('rejects non-members before accessing notifications', async () => {
      const { service, prisma } = setup();
      prisma.organizationMember.findUnique.mockResolvedValue(null);

      await expect(
        service.markAsRead(USER, {
          organizationId: ORG,
          notificationId: 'notification-1',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.notification.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('markAllAsRead', () => {
    it('marks only the current recipient unread notifications as read', async () => {
      const { service, prisma } = setup();

      await expect(
        service.markAllAsRead(USER, { organizationId: ORG }),
      ).resolves.toBe(1);

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: {
          recipientId: USER,
          organizationId: ORG,
          readAt: null,
        },
        data: {
          readAt: expect.any(Date),
        },
      });
    });

    it('returns zero when no unread notifications were updated', async () => {
      const { service, prisma } = setup();
      prisma.notification.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.markAllAsRead(USER, { organizationId: ORG }),
      ).resolves.toBe(0);
    });

    it('rejects non-members before updating notifications', async () => {
      const { service, prisma } = setup();
      prisma.organizationMember.findUnique.mockResolvedValue(null);

      await expect(
        service.markAllAsRead(USER, { organizationId: ORG }),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.notification.updateMany).not.toHaveBeenCalled();
    });
  });
});
