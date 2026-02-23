
import Fastify from 'fastify';
import { env } from './config/env.js';
import healthRoutes from './adapters/rest/health.js';
import { telegramWebhookRoutes } from './adapters/telegram/webhook.js';

export function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
  });
  app.register(healthRoutes);
  app.register(telegramWebhookRoutes);
  return app;
}
