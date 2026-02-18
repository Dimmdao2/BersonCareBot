
import { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';
import { upsertUser } from '../db/usersRepo.js';
import { logger, getRequestLogger } from '../logger.js';

export async function telegramWebhookRoutes(app: FastifyInstance) {
  app.post('/webhook/telegram', async (request, reply) => {
    const secretHeader = request.headers['x-telegram-bot-api-secret-token'];
    const expectedSecret = env.TG_WEBHOOK_SECRET;
    if (typeof expectedSecret === 'string') {
      if (typeof secretHeader !== 'string' || secretHeader !== expectedSecret) {
        return reply.code(403).send({ ok: false });
      }
    }

    // Обработка только message.text === '/start'
    // Типизация body
    interface TelegramWebhookBody {
      update_id?: number;
      message?: {
        text?: string;
        from?: {
          id: number;
          username?: string;
          first_name?: string;
          last_name?: string;
          phone?: string;
          language_code?: string;
          is_bot?: boolean;
        };
        chat?: {
          id: number;
        };
      };
    }
    const body = request.body as TelegramWebhookBody;
    const requestId = body.update_id ? String(body.update_id) : undefined;
    const reqLogger = requestId ? getRequestLogger(requestId) : logger;

    if (body && body.message && body.message.text === '/start') {
      const user = body.message.from;
      if (user && user.id) {
        const upserted = await upsertUser({
          telegram_id: user.id,
          username: user.username,
          first_name: user.first_name,
          last_name: user.last_name,
          phone: user.phone,
          _language_code: user.language_code,
        });
        reqLogger.info({
          event: '/start',
          update_id: body.update_id,
          user_id: upserted.id,
          chat_id: body.message && body.message.chat ? body.message.chat.id : undefined,
          username: upserted.username,
          first_name: upserted.first_name,
          last_name: upserted.last_name,
          language_code: upserted.language_code,
          is_bot: user.is_bot === false,
          created_at: upserted.created_at,
          updated_at: upserted.updated_at,
        }, '/start user upserted');
      }
    }
    return reply.code(200).send({ ok: true });
  });
}
