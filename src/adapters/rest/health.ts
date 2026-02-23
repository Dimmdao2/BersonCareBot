import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { checkDb } from '../../services/healthService.js';
import type { HealthResponse } from './contract.js';

const healthRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get<{ Reply: HealthResponse }>('/health', async (_request, _reply) => {
    const dbOk = await checkDb();
    const body: HealthResponse = { ok: true, db: dbOk ? 'up' : 'down' };
    return body;
  });
};

export default healthRoute;
