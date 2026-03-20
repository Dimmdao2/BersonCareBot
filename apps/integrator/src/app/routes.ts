import type { FastifyInstance } from 'fastify';
import { registerBersoncareSendSmsRoute } from '../integrations/bersoncare/sendSmsRoute.js';
import { integratorWebhookSecret } from '../config/env.js';
import type { AppDeps, ProjectionHealthSnapshot } from './di.js';

/** Public response shape for the health endpoint. */
export type HealthResponse = {
  ok: true;
  db: 'up' | 'down';
};

/** Response shape for projection health (release gate). */
export type ProjectionHealthResponse = ProjectionHealthSnapshot;

/**
 * Registers all HTTP routes for the app layer.
 * Business routing is delegated to integration registrars + eventGateway.
 */
export async function registerRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  app.get<{ Reply: HealthResponse }>('/health', async (_request, _reply) => {
    const dbOk = await deps.healthCheckDb();
    const body: HealthResponse = { ok: true, db: dbOk ? 'up' : 'down' };
    return body;
  });

  app.get<{ Reply: ProjectionHealthResponse }>('/health/projection', async (_request, reply) => {
    try {
      const snapshot = await deps.getProjectionHealth();
      return reply.code(200).send(snapshot);
    } catch {
      return reply.code(503).send({
        pendingCount: 0,
        deadCount: 0,
        oldestPendingAt: null,
        processingCount: 0,
        retryDistribution: {},
      });
    }
  });

  await registerBersoncareSendSmsRoute(app, {
    smsClient: deps.smsClient,
    sharedSecret: integratorWebhookSecret(),
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

  if (deps.registerMaxWebhookRoutes) {
    app.register(async (instance) => {
      await deps.registerMaxWebhookRoutes?.(instance, {
        eventGateway: deps.eventGateway,
      });
    });
  }
}

