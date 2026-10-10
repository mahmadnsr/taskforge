import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerGuard } from '@nestjs/throttler';
import { GraphQLError } from 'graphql';

@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  getRequestResponse(context: ExecutionContext) {
    if (context.getType<string>() === 'graphql') {
      const ctx = GqlExecutionContext.create(context).getContext();
      return { req: ctx.req, res: ctx.req.res };
    }
    return super.getRequestResponse(context);
  }

  protected async throwThrottlingException(): Promise<void> {
    throw new GraphQLError('Too many requests, please try again later', {
      extensions: { code: 'TOO_MANY_REQUESTS' },
    });
  }
}