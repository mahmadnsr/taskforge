import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
  } from '@nestjs/common';
  import { GqlExecutionContext } from '@nestjs/graphql';
  import { JwtService } from '@nestjs/jwt';
  
  @Injectable()
  export class JwtAuthGuard implements CanActivate {
    constructor(private jwt: JwtService) {}
  
    async canActivate(context: ExecutionContext): Promise<boolean> {
      const req = GqlExecutionContext.create(context).getContext().req;
  
      const header: string | undefined = req.headers?.authorization;
      const [type, token] = header?.split(' ') ?? [];
      if (type !== 'Bearer' || !token) {
        throw new UnauthorizedException('Missing access token');
      }
  
      try {
        const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
        req.user = { id: payload.sub };
        return true;
      } catch {
        throw new UnauthorizedException('Invalid or expired access token');
      }
    }
  }