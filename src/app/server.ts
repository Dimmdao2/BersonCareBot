import Fastify from 'fastify';
import { env } from '../config/env.js';
import { integrationRegistry } from '../integrations/registry.js';
import { buildDeps } from './di.js';
import { registerRoutes } from './routes.js';

export function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
  });
  const deps = buildDeps();
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
