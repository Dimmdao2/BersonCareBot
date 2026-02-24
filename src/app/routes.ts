import type { FastifyInstance } from 'fastify';
import type { AppDeps } from './di.js';
import { env } from '../config/env.js';
import { getBotInstance } from '../channels/telegram/client.js';
import { telegramWebhookRoutes } from '../channels/telegram/webhook.js';
import { rubitimeWebhookRoutes } from '../integrations/rubitime/webhook.js';
import { registerRubitimeReqSuccessIframeRoute } from '../integrations/rubitime/reqSuccessIframe.js';

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

  registerRubitimeReqSuccessIframeRoute(app, {
    getRecordByRubitimeId: deps.getRubitimeRecordById,
    findTelegramUserByPhone: deps.findTelegramUserByPhone,
  });

  const botApi = getBotInstance().api;
  rubitimeWebhookRoutes(app, {
    tgApi: { sendMessage: (chatId, text) => botApi.sendMessage(chatId, text) },
    smsClient: deps.smsClient,
    findTelegramUserByPhone: deps.findTelegramUserByPhone,
    insertEvent: deps.insertRubitimeEvent,
    upsertRecord: deps.upsertRubitimeRecord,
    adminTelegramId: env.ADMIN_TELEGRAM_ID,
    webhookToken: env.RUBITIME_WEBHOOK_TOKEN,
    debugNotifyAdmin: env.RUBITIME_DEBUG_NOTIFY_ADMIN,
  });
}
