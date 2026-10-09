var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { ForbiddenException, Injectable, } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
let RolesGuard = class RolesGuard {
    reflector;
    prisma;
    constructor(reflector, prisma) {
        this.reflector = reflector;
        this.prisma = prisma;
    }
    async canActivate(context) {
        const req = GqlExecutionContext.create(context).getContext().req;
        const userId = req.user?.id;
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
        const requiredRoles = this.reflector.getAllAndOverride(ROLES_KEY, [context.getHandler(), context.getClass()]);
        if (requiredRoles?.length && !requiredRoles.includes(membership.role)) {
            throw new ForbiddenException('Insufficient role');
        }
        req.membership = { organizationId, role: membership.role };
        return true;
    }
};
RolesGuard = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [Reflector,
        PrismaService])
], RolesGuard);
export { RolesGuard };
//# sourceMappingURL=roles.guard.js.map