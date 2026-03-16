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
  return { enabled, apiKey, webhookSecret, botId };
}

export const maxConfig = defineIntegrationConfig('max', MaxConfigSchema, loadMaxConfigFromEnv());
