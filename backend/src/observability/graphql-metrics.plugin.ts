import type { ApolloServerPlugin, BaseContext } from '@apollo/server';
import type { MetricsService } from './metrics.service.js';

export function createGraphqlMetricsPlugin(
  metrics: MetricsService,
): ApolloServerPlugin<BaseContext> {
  return {
    async requestDidStart() {
      const started = performance.now();
      let operation = 'unknown';
      let hasErrors = false;
      return {
        async didResolveOperation(context) {
          operation = context.operation?.operation ?? 'unknown';
        },
        async didEncounterErrors() {
          hasErrors = true;
        },
        async willSendResponse() {
          metrics.observeGraphql(operation, hasErrors, performance.now() - started);
        },
      };
    },
  };
}
