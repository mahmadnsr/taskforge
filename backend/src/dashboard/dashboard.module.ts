import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { DashboardResolver } from './dashboard.resolver.js';
import { DashboardService } from './dashboard.service.js';
import { AnalyticsService } from './analytics.service.js';
import { AnalyticsResolver } from './analytics.resolver.js';

@Module({
  imports: [PrismaModule],
  providers: [DashboardService, DashboardResolver, AnalyticsService, AnalyticsResolver],
})
export class DashboardModule {}
