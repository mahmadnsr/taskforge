import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { NotificationsStreamController } from './notifications-stream.controller.js';

afterEach(() => vi.useRealTimers());

function setup() {
  const jwt = { verifyAsync: vi.fn().mockResolvedValue({ sub: 'recipient', exp: Math.floor(Date.now() / 1000) + 60 }) };
  const notifications = { streamChanges: vi.fn().mockResolvedValue([]) };
  const controller = new NotificationsStreamController(jwt as never, notifications as never);
  const response = Object.assign(new EventEmitter(), {
    set: vi.fn(), flushHeaders: vi.fn(), write: vi.fn().mockReturnValue(true), end: vi.fn(),
  });
  return { jwt, notifications, controller, response };
}

describe('notification stream authentication and lifecycle', () => {
  it('rejects missing and invalid bearer tokens before opening a stream', async () => {
    const { controller, jwt, response } = setup();
    await expect(controller.stream({ headers: {} } as never, response as never)).rejects.toBeInstanceOf(UnauthorizedException);
    jwt.verifyAsync.mockRejectedValueOnce(new Error('expired'));
    await expect(controller.stream({ headers: { authorization: 'Bearer invalid' } } as never, response as never)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(response.flushHeaders).not.toHaveBeenCalled();
  });

  it('queries only the verified recipient and releases the connection on close', async () => {
    vi.useFakeTimers();
    const { controller, notifications, response } = setup();
    await controller.stream({ headers: { authorization: 'Bearer valid' } } as never, response as never);
    expect(response.write).toHaveBeenCalledWith('event: sync\ndata: {}\n\n');
    await vi.advanceTimersByTimeAsync(2000);
    expect(notifications.streamChanges).toHaveBeenCalledWith('recipient', expect.any(Object));
    response.emit('close');
    expect(response.end).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(2000);
    expect(notifications.streamChanges).toHaveBeenCalledOnce();
  });
});
