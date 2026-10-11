import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { InvitationsService } from './invitations.service.js';
import { OrganizationInvitation } from './entities/organization-invitation.entity.js';
import { InviteMemberInput } from './dto/invite-member.input.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@Resolver(() => OrganizationInvitation)
export class InvitationsResolver {
  constructor(private invitationsService: InvitationsService) {}

  @Mutation(() => OrganizationInvitation)
  @UseGuards(JwtAuthGuard)
  inviteMember(
    @CurrentUser() user: { id: string },
    @Args('input') input: InviteMemberInput,
  ) {
    return this.invitationsService.inviteMember(user.id, input);
  }
}
