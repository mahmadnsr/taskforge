import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { OrganizationsService } from './organizations.service.js';
import { OrganizationMember } from './entities/organization-member.entity.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@Resolver(() => OrganizationMember)
export class OrganizationMembersResolver {
  constructor(private organizationsService: OrganizationsService) {}

  @Query(() => [OrganizationMember])
  @UseGuards(JwtAuthGuard)
  organizationMembers(
    @CurrentUser() user: { id: string },
    @Args('organizationId', { type: () => ID }) organizationId: string,
  ) {
    return this.organizationsService.listMembers(user.id, organizationId);
  }

  @Query(() => OrganizationMember)
  @UseGuards(JwtAuthGuard)
  organizationMember(
    @CurrentUser() user: { id: string },
    @Args('organizationId', { type: () => ID }) organizationId: string,
    @Args('userId', { type: () => ID }) userId: string,
  ) {
    return this.organizationsService.getMember(user.id, organizationId, userId);
  }
}