import Fastify from 'fastify';
import { env } from '../config/env.js';
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
  return app;
}
