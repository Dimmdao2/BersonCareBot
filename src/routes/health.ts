
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { healthCheckDb } from '../db/client.js';

const healthRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/health', async (_request, _reply) => {
    const dbOk = await healthCheckDb();
    return { ok: true, db: dbOk ? 'up' : 'down' };
  });
};

export default healthRoute;
