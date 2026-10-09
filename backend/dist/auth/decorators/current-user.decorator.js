import { createParamDecorator } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
export const CurrentUser = createParamDecorator((_data, context) => GqlExecutionContext.create(context).getContext().req.user);
//# sourceMappingURL=current-user.decorator.js.map