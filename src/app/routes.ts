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
        ...(deps.onTelegramAcceptedEvent
          ? { onAcceptedEvent: deps.onTelegramAcceptedEvent }
          : {}),
      });
    });
  }

  if (deps.registerRubitimeWebhookRoutes) {
    app.register(async (instance) => {
      await deps.registerRubitimeWebhookRoutes?.(instance, {
        eventGateway: deps.eventGateway,
        ...(deps.onRubitimeAcceptedEvent
          ? { onAcceptedEvent: deps.onRubitimeAcceptedEvent }
          : {}),
      });
    });
  }

  // ARCH-V3 MOVE
  // этот код должен быть перенесён в pipeline-обработку (step 12),
  // интеграция rubitime должна отдавать наружу только один входящий event в eventGateway
  // Rubitime iframe endpoint is optional during migration.
  deps.registerRubitimeReqSuccessIframeRoute?.(app);

}
