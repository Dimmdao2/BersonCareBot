import { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';

export async function telegramWebhookRoutes(app: FastifyInstance) {
  app.post('/webhook/telegram', async (request, reply) => {
    const secretHeader = request.headers['x-telegram-bot-api-secret-token'];
    const expectedSecret = env.TG_WEBHOOK_SECRET;
    if (typeof expectedSecret === 'string') {
      if (typeof secretHeader !== 'string' || secretHeader !== expectedSecret) {
        return reply.code(403).send({ ok: false });
      }
    }
    return reply.code(200).send({ ok: true });
  });
}
