import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';

@Injectable()
export class MetricsAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('METRICS_ACCESS_TOKEN');
    const header = context.switchToHttp().getRequest<{ headers?: { authorization?: unknown } }>().headers?.authorization;
    if (!expected || typeof header !== 'string') throw new UnauthorizedException();
    const [scheme, supplied, ...extra] = header.split(' ');
    if (scheme !== 'Bearer' || !supplied || extra.length > 0) throw new UnauthorizedException();
    const actualBuffer = Buffer.from(supplied);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
