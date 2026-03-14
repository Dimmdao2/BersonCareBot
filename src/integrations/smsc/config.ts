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
  let enabled = enabledRaw === 'false' || enabledRaw === '0' ? false : true;
  const apiKey = process.env.SMSC_API_KEY?.trim() ?? '';
  const baseUrlRaw = process.env.SMSC_BASE_URL?.trim() || 'https://smsc.ru/sys/send.php';
  if (enabled && !apiKey) {
    enabled = false;
    if (typeof process !== 'undefined' && process.emitWarning) {
      process.emitWarning(
        'SMSC_ENABLED=true but SMSC_API_KEY is empty (check EnvironmentFile and that no .env overwrites it). SMS disabled.',
        'SMSCConfig',
      );
    }
  }
  return {
    enabled,
    apiKey,
    baseUrl: enabled ? baseUrlRaw : '',
  };
}

export const smscConfig = defineIntegrationConfig(
  'smsc',
  SmscConfigSchema,
  loadSmscConfigFromEnv(),
);
