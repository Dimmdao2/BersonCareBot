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
    windowMinutes: env.RUBITIME_REQSUCCESS_WINDOW_MINUTES,
    delayMinMs: env.RUBITIME_REQSUCCESS_DELAY_MIN_MS,
    delayMaxMs: env.RUBITIME_REQSUCCESS_DELAY_MAX_MS,
    ipLimitPerMin: env.RUBITIME_REQSUCCESS_IP_LIMIT_PER_MIN,
    globalLimitPerMin: env.RUBITIME_REQSUCCESS_GLOBAL_LIMIT_PER_MIN,
  });

  const botApi = getBotInstance().api;
  rubitimeWebhookRoutes(app, {
    insertEvent: deps.insertRubitimeEvent,
    upsertRecord: deps.upsertRubitimeRecord,
    dispatchMessageByPhone: async ({ phoneNormalized, messageText, smsFallbackText }) => {
      const fallback = async () => {
        await deps.smsClient.sendSms({
          toPhone: phoneNormalized ?? '',
          message: smsFallbackText,
        });
      };

      if (!phoneNormalized) {
        await fallback();
        return;
      }
      const user = await deps.findTelegramUserByPhone(phoneNormalized);
      if (!user) {
        await fallback();
        return;
      }
      try {
        await botApi.sendMessage(user.chatId, messageText);
      } catch {
        await fallback();
      }
    },
    webhookToken: env.RUBITIME_WEBHOOK_TOKEN,
  });
}
