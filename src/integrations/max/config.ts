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
});

function loadMaxConfigFromEnv(): z.input<typeof MaxConfigSchema> {
  loadIntegrationEnv(__dirname, 'MAX_');
  const enabled = /^(1|true|yes)$/i.test(String(process.env.MAX_ENABLED ?? '').trim());
  const apiKey = process.env.MAX_API_KEY?.trim() ?? '';
  const webhookSecret = process.env.MAX_WEBHOOK_SECRET?.trim() ?? '';
  const botId = process.env.MAX_BOT_ID?.trim() ?? '';

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

  return { enabled, apiKey, webhookSecret, botId };
}

export const maxConfig = defineIntegrationConfig('max', MaxConfigSchema, loadMaxConfigFromEnv());
