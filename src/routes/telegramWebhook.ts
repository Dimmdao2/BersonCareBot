import { FastifyInstance } from 'fastify';

export async function telegramWebhookRoutes(app: FastifyInstance) {
  app.post('/webhook/telegram', async (request, reply) => {
    return reply.code(200).send({ ok: true });
  });
}
