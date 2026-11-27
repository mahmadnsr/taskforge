import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { QueuesModule } from '../queues/queues.module.js';
import { MetricsAuthGuard } from './metrics-auth.guard.js';
import { MetricsController } from './metrics.controller.js';
import { MetricsService } from './metrics.service.js';
import { MonitoringSnapshotService } from './monitoring-snapshot.service.js';
import { RequestContextMiddleware } from './request-context.middleware.js';

@Global()
@Module({
  imports: [PrismaModule, QueuesModule],
  controllers: [MetricsController],
  providers: [MetricsService, MetricsAuthGuard, MonitoringSnapshotService, RequestContextMiddleware],
  exports: [MetricsService],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
