import { UseGuards } from '@nestjs/common';
import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { DashboardSummary } from './entities/dashboard-summary.entity.js';
import { DashboardService } from './dashboard.service.js';

@Resolver(() => DashboardSummary)
@UseGuards(JwtAuthGuard)
export class DashboardResolver {
  constructor(private readonly dashboardService: DashboardService) {}

  @Query(() => DashboardSummary)
  dashboardSummary(
    @CurrentUser() user: { id: string },
    @Args('organizationId', { type: () => ID }) organizationId: string,
  ): Promise<DashboardSummary> {
    return this.dashboardService.getSummary(user.id, organizationId);
  }
}
