import Fastify from 'fastify';
import { env } from '../config/env.js';
import { integrationRegistry } from '../integrations/registry.js';
import { buildDeps, type BuildDepsInput } from './di.js';
import { registerRoutes } from './routes.js';

/**
 * Builds Fastify app instance and wires routes with composed dependencies.
 * The app layer stays focused on bootstrap/wiring only.
 */
export function buildApp(input?: BuildDepsInput) {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
  });

  const deps = buildDeps(input);
  registerRoutes(app, deps);

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
