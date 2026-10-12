import { Module } from '@nestjs/common';
import { OrganizationsService } from './organizations.service.js';
import { OrganizationsResolver } from './organizations.resolver.js';
import { OrganizationMembersResolver } from './organization-members.resolver.js';
import { InvitationsService } from './invitations.service.js';
import { InvitationsResolver } from './invitations.resolver.js';
import { MemberManagementService } from './member-management.service.js';
import { MemberManagementResolver } from './member-management.resolver.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  providers: [
    OrganizationsService,
    OrganizationsResolver,
    OrganizationMembersResolver,
    InvitationsService,
    InvitationsResolver,
    MemberManagementService,
    MemberManagementResolver,
  ],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
