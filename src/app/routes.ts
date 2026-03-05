import type { FastifyInstance } from 'fastify';
import type { AppDeps } from './di.js';

/** Public response shape for the health endpoint. */
export type HealthResponse = {
  ok: true;
  db: 'up' | 'down';
};

/**
 * Registers all HTTP routes for the app layer.
 * Business routing is delegated to integration registrars + eventGateway.
 */
export function registerRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get<{ Reply: HealthResponse }>('/health', async (_request, _reply) => {
    const dbOk = await deps.healthCheckDb();
    const body: HealthResponse = { ok: true, db: dbOk ? 'up' : 'down' };
    return body;
  });

  if (deps.registerTelegramWebhookRoutes) {
    app.register(async (instance) => {
      await deps.registerTelegramWebhookRoutes?.(instance, {
        eventGateway: deps.eventGateway,
      });
    });
  }

  if (deps.registerRubitimeWebhookRoutes) {
    app.register(async (instance) => {
      await deps.registerRubitimeWebhookRoutes?.(instance, {
        eventGateway: deps.eventGateway,
      });
    });
  }
}
