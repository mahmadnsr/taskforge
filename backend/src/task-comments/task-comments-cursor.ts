import { BadRequestException } from '@nestjs/common';

interface TaskCommentCursor {
  createdAt: string;
  id: string;
}

export function encodeTaskCommentCursor(
  cursor: TaskCommentCursor,
): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function decodeTaskCommentCursor(
  cursor: string,
): TaskCommentCursor {
  try {
    // Reject empty strings and characters outside the Base64URL alphabet.
    if (!cursor || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
      throw new Error('Invalid Base64URL encoding');
    }

    const decodedBuffer = Buffer.from(cursor, 'base64url');

    // Buffer decoding is permissive, so require canonical Base64URL.
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
      (() => {
        const match = /^(\d{4})-(\d{2})-(\d{2})T/.exec(payload.createdAt);
        if (!match) return true;
        const [, year, month, day] = match;
        const date = new Date(Date.parse(payload.createdAt));
        return (
          !Number.isFinite(date.getTime()) ||
          date.getUTCFullYear() !== Number(year) ||
          date.getUTCMonth() + 1 !== Number(month) ||
          date.getUTCDate() !== Number(day)
        );
      })() ||
      typeof payload.id !== 'string' ||
      !payload.id.trim() ||
      payload.id !== payload.id.trim()
    ) {
      throw new Error('Invalid cursor payload');
    }

    return {
      createdAt: new Date(payload.createdAt).toISOString(),
      id: payload.id,
    };
  } catch {
    throw new BadRequestException('Invalid comment cursor');
  }
}
