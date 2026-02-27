import type { FastifyInstance } from 'fastify';
import type { AppDeps } from './di.js';
import { env } from '../config/env.js';
import { getBotInstance } from '../integrations/telegram/client.js';
import { telegramWebhookRoutes } from '../integrations/telegram/webhook.js';
import { rubitimeWebhookRoutes } from '../integrations/rubitime/webhook.js';
import { registerRubitimeReqSuccessIframeRoute } from '../integrations/rubitime/reqSuccessIframe.js';
import { createMessageByPhoneDispatcher } from './dispatchers/messageByPhone.js';

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
    windowMinutes: env.RUBITIME_REQSUCCESS_WINDOW_MINUTES,
    delayMinMs: env.RUBITIME_REQSUCCESS_DELAY_MIN_MS,
    delayMaxMs: env.RUBITIME_REQSUCCESS_DELAY_MAX_MS,
    ipLimitPerMin: env.RUBITIME_REQSUCCESS_IP_LIMIT_PER_MIN,
    globalLimitPerMin: env.RUBITIME_REQSUCCESS_GLOBAL_LIMIT_PER_MIN,
  });

  const botApi = getBotInstance().api;
  const messageByPhoneDispatcher = createMessageByPhoneDispatcher({
    findTelegramUserByPhone: deps.findTelegramUserByPhone,
    sendTelegramMessage: (chatId, text) => botApi.sendMessage(chatId, text),
    smsClient: deps.smsClient,
  });
  rubitimeWebhookRoutes(app, {
    insertEvent: deps.insertRubitimeEvent,
    upsertRecord: deps.upsertRubitimeRecord,
    dispatchMessageByPhone: (input) => messageByPhoneDispatcher.dispatchMessageByPhone(input),
    webhookToken: env.RUBITIME_WEBHOOK_TOKEN,
  });
}
