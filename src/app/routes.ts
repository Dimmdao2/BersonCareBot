import type { FastifyInstance } from 'fastify';
import type { AppDeps } from './di.js';
import { env } from '../config/env.js';
import { getBotInstance } from '../channels/telegram/client.js';
import { telegramWebhookRoutes } from '../channels/telegram/webhook.js';
import { rubitimeWebhookRoutes } from '../integrations/rubitime/webhook.js';

export type HealthResponse = {
  ok: true;
  db: 'up' | 'down';
};

export function registerRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get<{ Reply: HealthResponse }>('/health', async (_request, _reply) => {
    const dbOk = await deps.healthCheckDb();
    const body: HealthResponse = { ok: true, db: dbOk ? 'up' : 'down' };
    return body;
  });

  app.register(async (instance) => {
    await telegramWebhookRoutes(instance, deps);
  });

  if (env.RUBITIME_WEBHOOK_TOKEN) {
    const botApi = getBotInstance().api;
    rubitimeWebhookRoutes(app, {
      tgApi: { sendMessage: (chatId, text) => botApi.sendMessage(chatId, text) },
      inboxChatId: env.INBOX_CHAT_ID,
      webhookToken: env.RUBITIME_WEBHOOK_TOKEN,
    });
  }
}
