import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { MetricsAuthGuard } from './metrics-auth.guard.js';
import { MetricsService } from './metrics.service.js';
import { MonitoringSnapshotService } from './monitoring-snapshot.service.js';

@Controller('metrics')
@UseGuards(MetricsAuthGuard)
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly snapshot: MonitoringSnapshotService,
  ) {}

  @Get()
  @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    return this.metrics.render(await this.snapshot.collect());
  }
}
