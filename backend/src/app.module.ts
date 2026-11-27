import { Module } from '@nestjs/common';
import { QueuesModule } from './queues/queues.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { AppResolver } from './app/app.resolver.js';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { AuthModule } from './auth/auth.module.js';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { GqlThrottlerGuard } from './common/guards/gql-throttler.guard.js';
import { validateEnv } from './config/env.validation.js';
import { ProjectsModule } from './projects/projects.module.js';
import { formatGraphQLError } from './common/graphql/format-error.js';
import { TasksModule } from './tasks/tasks.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { HealthModule } from './health/health.module.js';
import { ObservabilityModule } from './observability/observability.module.js';
import { MetricsService } from './observability/metrics.service.js';
import { createGraphqlMetricsPlugin } from './observability/graphql-metrics.plugin.js';

import { TaskCommentsModule } from './task-comments/task-comments.module.js';

@Module({
  imports: [
    TaskCommentsModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    ObservabilityModule,
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      imports: [ObservabilityModule],
      inject: [MetricsService],
      useFactory: (metrics: MetricsService) => ({
        autoSchemaFile: true,
        playground: process.env.NODE_ENV !== 'production',
        context: ({ req }: { req: unknown }) => ({ req }),
        includeStacktraceInErrorResponses: false,
        plugins: [createGraphqlMetricsPlugin(metrics)],
        formatError: (formattedError, error) =>
          formatGraphQLError(
            formattedError,
            error,
            process.env.NODE_ENV === 'production',
          ),
      }),
    }),
    PrismaModule,
    UsersModule,
    OrganizationsModule,
    ProjectsModule,
    AuthModule,
    TasksModule,
    NotificationsModule,
    DashboardModule,
    HealthModule,
    QueuesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    AppResolver,
    { provide: APP_GUARD, useClass: GqlThrottlerGuard },
  ],
})
export class AppModule {}
