import Fastify from 'fastify';
import type { FastifyBaseLogger } from 'fastify';
import { logger } from '../infra/observability/logger.js';
import {
  registerHttpCorrelationContext,
  resolveHttpCorrelationId,
} from '../infra/observability/httpCorrelation.js';
import { integrationRegistry } from '../integrations/registry.js';
import { buildDeps, type BuildDepsInput } from './di.js';
import { registerRoutes } from './routes.js';
import { isRecognizedSaasIsolationFailure } from '@bersoncare/db-principal';
import { reportIntegratorIsolationFailure } from '../infra/observability/saasIsolationTelemetry.js';
import { captureUnexpectedIntegratorHttpError } from '../infra/observability/errorTracking.js';

/**
 * Builds Fastify app instance and wires routes with composed dependencies.
 * The app layer stays focused on bootstrap/wiring only.
 */
export async function buildApp(input?: BuildDepsInput) {
  const app = Fastify({
    loggerInstance: logger as FastifyBaseLogger,
    genReqId: resolveHttpCorrelationId,
  });
  registerHttpCorrelationContext(app);

  const deps = buildDeps(input);
  await registerRoutes(app, deps);
  app.addHook('onError', async (_request, _reply, error) => {
    if (isRecognizedSaasIsolationFailure(error)) reportIntegratorIsolationFailure(error);
    const statusCode = typeof error.statusCode === 'number' ? error.statusCode : 500;
    captureUnexpectedIntegratorHttpError(error, statusCode);
  });

  app.log.info(
    {
      integrations: integrationRegistry.map((x) => ({
        id: x.id,
        kind: x.kind,
        incoming: x.capabilities.supportsIncoming,
        outgoing: x.capabilities.supportsOutgoing,
      })),
    },
    'integration registry loaded',
  );

  return app;
}
