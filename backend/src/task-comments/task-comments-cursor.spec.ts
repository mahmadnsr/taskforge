import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  decodeTaskCommentCursor,
  encodeTaskCommentCursor,
} from './task-comments-cursor.js';

describe('task-comments-cursor', () => {
  it('encodes and decodes a valid cursor', () => {
    const cursor = {
      createdAt: '2026-10-20T10:00:00.000Z',
      id: 'comment-123',
    };

    expect(decodeTaskCommentCursor(encodeTaskCommentCursor(cursor))).toEqual(
      cursor,
    );
  });

  it('normalizes a valid date to ISO format', () => {
    const payload = {
      createdAt: '2026-10-20T10:00:00+00:00',
      id: 'comment-123',
    };
    const cursor = Buffer.from(JSON.stringify(payload)).toString('base64url');

    expect(decodeTaskCommentCursor(cursor)).toEqual({
      createdAt: '2026-10-20T10:00:00.000Z',
      id: 'comment-123',
    });
  });

  it.each([
    '',
    '%%%invalid%%%',
    'abc=',
    'eyJpZCI6',
    Buffer.from(JSON.stringify({ createdAt: 'not-a-date', id: 'comment-1' }))
      .toString('base64url'),
    Buffer.from(JSON.stringify({ createdAt: '2026-02-30T10:00:00.000Z', id: 'comment-1' }))
      .toString('base64url'),
    Buffer.from(JSON.stringify({ createdAt: '2026-01-01', id: 'comment-1' }))
      .toString('base64url'),
    Buffer.from(JSON.stringify({ createdAt: '2026-10-20T10:00:00.000Z', id: '' }))
      .toString('base64url'),
    Buffer.from(JSON.stringify({ createdAt: '2026-10-20T10:00:00.000Z', id: ' comment-1' }))
      .toString('base64url'),
    Buffer.from(JSON.stringify({ createdAt: '2026-10-20T10:00:00.000Z' }))
      .toString('base64url'),
    Buffer.from(JSON.stringify(['2026-10-20T10:00:00.000Z', 'comment-1']))
      .toString('base64url'),
  ])('rejects invalid cursor: %s', (cursor) => {
    expect(() => decodeTaskCommentCursor(cursor)).toThrow(
      new BadRequestException('Invalid comment cursor'),
    );
  });
});
