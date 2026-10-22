import { BadRequestException } from '@nestjs/common';

interface NotificationCursor {
  createdAt: string;
  id: string;
}

export function encodeNotificationCursor(
  cursor: NotificationCursor,
): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function decodeNotificationCursor(
  cursor: string,
): NotificationCursor {
  try {
    if (!cursor || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
      throw new Error('Invalid Base64URL encoding');
    }

    const decodedBuffer = Buffer.from(cursor, 'base64url');

    if (decodedBuffer.toString('base64url') !== cursor) {
      throw new Error('Non-canonical Base64URL encoding');
    }

    const payload: unknown = JSON.parse(decodedBuffer.toString('utf8'));

    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload) ||
      !('createdAt' in payload) ||
      !('id' in payload) ||
      typeof payload.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(payload.createdAt)) ||
      !/^\d{4}-\d{2}-\d{2}T/.test(payload.createdAt) ||
      typeof payload.id !== 'string' ||
      !payload.id.trim() ||
      payload.id !== payload.id.trim()
    ) {
      throw new Error('Invalid cursor payload');
    }

    const date = new Date(payload.createdAt);
    const match = /^(\d{4})-(\d{2})-(\d{2})T/.exec(payload.createdAt);

    if (
      !match ||
      date.getUTCFullYear() !== Number(match[1]) ||
      date.getUTCMonth() + 1 !== Number(match[2]) ||
      date.getUTCDate() !== Number(match[3])
    ) {
      throw new Error('Invalid cursor date');
    }

    return {
      createdAt: date.toISOString(),
      id: payload.id,
    };
  } catch {
    throw new BadRequestException('Invalid notification cursor');
  }
}
