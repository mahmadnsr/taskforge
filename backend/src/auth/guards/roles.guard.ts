import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
  } from '@nestjs/common';
  import { Reflector } from '@nestjs/core';
  import { GqlExecutionContext } from '@nestjs/graphql';
  import { Role } from '@prisma/client';
  import { PrismaService } from '../../prisma/prisma.service.js';
  import { ROLES_KEY } from '../decorators/roles.decorator.js';
  
  @Injectable()
  export class RolesGuard implements CanActivate {
    constructor(
      private reflector: Reflector,
      private prisma: PrismaService,
    ) {}
  
    async canActivate(context: ExecutionContext): Promise<boolean> {
      const req = GqlExecutionContext.create(context).getContext().req;
  
      const userId: string | undefined = req.user?.id;
      if (!userId) {
        throw new ForbiddenException('Authentication required');
      }
  
      const organizationId = req.headers?.['x-organization-id'];
      if (typeof organizationId !== 'string' || !organizationId) {
        throw new ForbiddenException('Missing x-organization-id header');
      }
      
      const membership = await this.prisma.organizationMember.findUnique({
        where: { userId_organizationId: { userId, organizationId } },
      });
      if (!membership) {
        throw new ForbiddenException('You are not a member of this organization');
      }
  
      const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(
        ROLES_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (requiredRoles?.length && !requiredRoles.includes(membership.role)) {
        throw new ForbiddenException('Insufficient role');
      }
  
      req.membership = { organizationId, role: membership.role };
      return true;
    }
  }