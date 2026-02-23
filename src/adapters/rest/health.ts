import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { checkDb } from '../../services/healthService.js';

const healthRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/health', async (_request, _reply) => {
    const dbOk = await checkDb();
    return { ok: true, db: dbOk ? 'up' : 'down' };
  });
};

export default healthRoute;
