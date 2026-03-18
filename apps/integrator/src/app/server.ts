import Fastify from 'fastify';
import { env } from '../config/env.js';
import { integrationRegistry } from '../integrations/registry.js';
import { buildDeps, type BuildDepsInput } from './di.js';
import { registerRoutes } from './routes.js';
import { telegramConfig } from '../integrations/telegram/config.js';

/**
 * Builds Fastify app instance and wires routes with composed dependencies.
 * The app layer stays focused on bootstrap/wiring only.
 */
export async function buildApp(input?: BuildDepsInput) {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
  });

  const deps = buildDeps(input);
  await registerRoutes(app, deps);

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

  app.log.info(
    { sendMenuOnButtonPress: telegramConfig.sendMenuOnButtonPress },
    'Telegram: sendMenuOnButtonPress (reply keyboard attached to message.send when true)',
  );

  return app;
}
