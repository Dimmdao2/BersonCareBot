import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { defineIntegrationConfig, loadIntegrationEnv } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SmscConfigSchema = z.object({
  enabled: z.boolean(),
  apiKey: z.string(),
  baseUrl: z.string().url().or(z.literal('')),
}).refine(
  (data) => !data.enabled || (data.apiKey.length > 0 && data.baseUrl.length > 0),
  { message: 'When SMSC is enabled, apiKey and baseUrl are required', path: ['apiKey'] },
);

function loadSmscConfigFromEnv(): z.input<typeof SmscConfigSchema> {
  loadIntegrationEnv(__dirname, 'SMSC_');
  const enabledRaw = process.env.SMSC_ENABLED?.trim().toLowerCase();
  const enabled = enabledRaw === 'false' || enabledRaw === '0' ? false : true;
  const baseUrlRaw = process.env.SMSC_BASE_URL?.trim() || 'https://smsc.ru/sys/send.php';
  return {
    enabled,
    apiKey: process.env.SMSC_API_KEY?.trim() ?? '',
    baseUrl: enabled ? baseUrlRaw : '',
  };
}

export const smscConfig = defineIntegrationConfig(
  'smsc',
  SmscConfigSchema,
  loadSmscConfigFromEnv(),
);
