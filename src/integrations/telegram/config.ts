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

  const sendMenuOnButtonPress = process.env.TELEGRAM_SEND_MENU_ON_BUTTON_PRESS !== undefined
    ? /^(1|true|yes)$/i.test(process.env.TELEGRAM_SEND_MENU_ON_BUTTON_PRESS.trim())
    : true;

  return {
    botToken,
    adminTelegramId: Number.isFinite(adminTelegramId) ? (adminTelegramId as number) : 0,
    ...(webhookSecret ? { webhookSecret } : {}),
    sendMenuOnButtonPress,
  };
}

export const telegramConfig = defineIntegrationConfig(
  'telegram',
  TelegramConfigSchema,
  loadTelegramConfigFromEnv(),
);
