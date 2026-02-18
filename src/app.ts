import Fastify from 'fastify';
import { env } from './config/env.js';
import healthRoutes from './routes/health.js';

export function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
  });
  app.register(healthRoutes);
  return app;
}
