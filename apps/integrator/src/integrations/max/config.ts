import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { defineIntegrationConfig, loadIntegrationEnv } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MaxConfigSchema = z.object({
  enabled: z.boolean(),
  apiKey: z.string(),
  webhookSecret: z.string(),
  botId: z.string(),
  adminChatId: z.number().int().optional(),
  adminUserId: z.number().int().optional(),
});

function loadMaxConfigFromEnv(): z.input<typeof MaxConfigSchema> {
  loadIntegrationEnv(__dirname, 'MAX_');
  const enabled = /^(1|true|yes)$/i.test(String(process.env.MAX_ENABLED ?? '').trim());
  const apiKey = process.env.MAX_API_KEY?.trim() ?? '';
  const webhookSecret = process.env.MAX_WEBHOOK_SECRET?.trim() ?? '';
  const botId = process.env.MAX_BOT_ID?.trim() ?? '';
  const adminChatIdRaw = process.env.MAX_ADMIN_CHAT_ID?.trim();
  const adminUserIdRaw = process.env.MAX_ADMIN_USER_ID?.trim();
  const adminChatId =
    adminChatIdRaw !== undefined && adminChatIdRaw !== ''
      ? Number(adminChatIdRaw)
      : undefined;
  const adminUserId =
    adminUserIdRaw !== undefined && adminUserIdRaw !== ''
      ? Number(adminUserIdRaw)
      : undefined;

  if (enabled && !apiKey && process.env.NODE_ENV === 'production' && typeof process.emitWarning === 'function') {
    process.emitWarning(
      'MAX_ENABLED=true but MAX_API_KEY is empty. Set MAX_API_KEY and MAX_WEBHOOK_SECRET in env (e.g. api.prod). MAX webhook disabled.',
      'MaxConfig',
    );
  }
  if (enabled && apiKey && !webhookSecret && process.env.NODE_ENV === 'production' && typeof process.emitWarning === 'function') {
    process.emitWarning(
      'MAX_WEBHOOK_SECRET is empty. Webhook will accept requests without secret check. Set MAX_WEBHOOK_SECRET for production.',
      'MaxConfig',
    );
  }

  return {
    enabled,
    apiKey,
    webhookSecret,
    botId,
    ...(Number.isFinite(adminChatId) ? { adminChatId: adminChatId as number } : {}),
    ...(Number.isFinite(adminUserId) ? { adminUserId: adminUserId as number } : {}),
  };
}

export const maxConfig = defineIntegrationConfig('max', MaxConfigSchema, loadMaxConfigFromEnv());
