import { ConflictException, Controller, Get, Req, Res, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { NotificationsService } from './notifications.service.js';

@Controller('notifications')
export class NotificationsStreamController {
  private readonly active = new Map<string, number>();
  private total = 0;

  constructor(private readonly jwt: JwtService, private readonly notifications: NotificationsService) {}

  @Get('stream')
  async stream(@Req() request: Request, @Res() response: Response) {
    const [type, token, extra] = (request.headers.authorization ?? '').split(' ');
    if (type !== 'Bearer' || !token || extra) throw new UnauthorizedException('Invalid or expired access token');
    let payload: { sub?: unknown; exp?: unknown };
    try {
      payload = await this.jwt.verifyAsync(token, { algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    if (typeof payload.sub !== 'string' || !payload.sub.trim() ||
      typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    const userId = payload.sub;
    if (this.total >= 100 || (this.active.get(userId) ?? 0) >= 3) {
      throw new ConflictException('Notification stream limit reached');
    }
    this.total++;
    this.active.set(userId, (this.active.get(userId) ?? 0) + 1);
    response.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    });
    response.flushHeaders();
    let closed = false;
    let busy = false;
    let ticks = 0;
    let cursor = { createdAt: new Date(), id: '' };
    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      clearTimeout(expiry);
      this.total--;
      const count = (this.active.get(userId) ?? 1) - 1;
      if (count > 0) this.active.set(userId, count);
      else this.active.delete(userId);
      response.end();
    };
    response.on('close', close);
    response.write('event: sync\ndata: {}\n\n');
    const poll = async () => {
      if (closed || busy) return;
      busy = true;
      try {
        const rows = await this.notifications.streamChanges(userId, cursor);
        if (closed) return;
        if (rows.length) {
          const last = rows.at(-1)!;
          cursor = { createdAt: last.createdAt, id: last.id };
          if (!response.write('event: changed\ndata: {}\n\n')) close();
        } else {
          ticks++;
          response.write(ticks % 15 === 0 ? 'event: sync\ndata: {}\n\n' : ': keepalive\n\n');
        }
      } catch {
        close();
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(() => void poll(), 2000);
    const expiry = setTimeout(close, Math.min(payload.exp * 1000 - Date.now(), 10 * 60_000));
  }
}
