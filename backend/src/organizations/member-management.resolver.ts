import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Resolver } from '@nestjs/graphql';
import { MemberManagementService } from './member-management.service.js';
import { OrganizationMember } from './entities/organization-member.entity.js';
import { UpdateMemberRoleInput } from './dto/update-member-role.input.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@Resolver(() => OrganizationMember)
export class MemberManagementResolver {
  constructor(private memberManagement: MemberManagementService) {}

  @Mutation(() => OrganizationMember)
  @UseGuards(JwtAuthGuard)
  updateMemberRole(
    @CurrentUser() user: { id: string },
    @Args('input') input: UpdateMemberRoleInput,
  ) {
    return this.memberManagement.updateRole(user.id, input);
  }

  @Mutation(() => Boolean)
  @UseGuards(JwtAuthGuard)
  removeMember(
    @CurrentUser() user: { id: string },
    @Args('organizationId', { type: () => ID }) organizationId: string,
    @Args('userId', { type: () => ID }) userId: string,
  ) {
    return this.memberManagement.removeMember(user.id, organizationId, userId);
  }
}
