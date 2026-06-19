import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { defineIntegrationConfig, loadIntegrationEnv } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TelegramConfigSchema = z.object({
  botToken: z.string(),
  adminTelegramId: z.number().int(),
  webhookSecret: z.string().min(1).optional(),
  /** When true, executor attaches main reply keyboard (from replyMenu.json) to every message to user that has no keyboard. */
  sendMenuOnButtonPress: z.boolean().optional(),
  /**
   * Incoming-updates delivery mode.
   * 'webhook' (default): register POST /webhook/telegram (Telegram pushes updates — needs public inbound).
   * 'long_polling': run a getUpdates loop instead — for hosts Telegram CANNOT reach inbound
   * (RU-isolated prod behind the AmneziaWG split-tunnel; only OUTBOUND to Telegram works).
   */
  mode: z.enum(['webhook', 'long_polling']).default('webhook'),
  /**
   * long_polling only. When true, call deleteWebhook() before polling so a stale webhook
   * does not make getUpdates return 409. DEFAULT false — NEVER auto-clears the live bot's
   * webhook; enable ONLY when this host owns the bot (i.e. at cutover, old host stopped).
   */
  deleteWebhookOnStart: z.boolean().optional(),
});

function loadTelegramConfigFromEnv(): z.input<typeof TelegramConfigSchema> {
  loadIntegrationEnv(__dirname, 'TELEGRAM_');
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? '';
  const adminIdRaw = process.env.TELEGRAM_ADMIN_ID?.trim();
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();

  const adminTelegramId =
    adminIdRaw !== undefined && adminIdRaw !== ''
      ? Number(adminIdRaw)
      : process.env.NODE_ENV !== 'production'
        ? 364943522
        : undefined;

  if (!botToken && process.env.NODE_ENV === 'production' && typeof process.emitWarning === 'function') {
    process.emitWarning(
      'TELEGRAM_BOT_TOKEN is empty. Check EnvironmentFile in systemd (systemctl show bersoncarebot-api-prod.service -p EnvironmentFiles) and /opt/env/bersoncarebot/api.prod. Telegram webhook disabled.',
      'TelegramConfig',
    );
  }

  const raw = process.env.TELEGRAM_SEND_MENU_ON_BUTTON_PRESS;
  const sendMenuOnButtonPress =
    raw !== undefined && raw !== ''
      ? /^(1|true|yes)$/i.test(String(raw).trim())
      : true;

  const modeRaw = process.env.TELEGRAM_MODE?.trim().toLowerCase();
  const mode: 'webhook' | 'long_polling' = modeRaw === 'long_polling' ? 'long_polling' : 'webhook';
  const deleteWebhookOnStart = /^(1|true|yes)$/i.test(
    String(process.env.TELEGRAM_DELETE_WEBHOOK_ON_START ?? '').trim(),
  );

  return {
    botToken,
    adminTelegramId: Number.isFinite(adminTelegramId) ? (adminTelegramId as number) : 0,
    ...(webhookSecret ? { webhookSecret } : {}),
    sendMenuOnButtonPress,
    mode,
    ...(deleteWebhookOnStart ? { deleteWebhookOnStart } : {}),
  };
}

export const telegramConfig = defineIntegrationConfig(
  'telegram',
  TelegramConfigSchema,
  loadTelegramConfigFromEnv(),
);
