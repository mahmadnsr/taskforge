import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { DashboardResolver } from './dashboard.resolver.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [PrismaModule],
  providers: [DashboardService, DashboardResolver],
})
export class DashboardModule {}
