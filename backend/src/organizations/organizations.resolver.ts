import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { OrganizationsService } from './organizations.service.js';
import { Organization } from './entities/organization.entity.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@Resolver(() => Organization)
export class OrganizationsResolver {
  constructor(private organizationsService: OrganizationsService) {}

  @Query(() => [Organization])
  @UseGuards(JwtAuthGuard)
  myOrganizations(@CurrentUser() user: { id: string }) {
    return this.organizationsService.findAllForUser(user.id);
  }

  @Query(() => Organization)
  @UseGuards(JwtAuthGuard)
  organization(
    @CurrentUser() user: { id: string },
    @Args('id', { type: () => ID }) id: string,
  ) {
    return this.organizationsService.findOneForMember(user.id, id);
  }
}
