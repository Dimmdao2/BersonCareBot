import { FastifyInstance, FastifyPluginAsync } from 'fastify';

const healthRoute: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/health', async (request, reply) => {
    return { ok: true };
  });
};

export default healthRoute;
