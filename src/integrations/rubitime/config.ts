import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { defineIntegrationConfig, loadIntegrationEnv } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const RubitimeConfigSchema = z.object({
  apiKey: z.string().min(1),
  webhookToken: z.string().min(1),
});

function loadRubitimeConfigFromEnv(): z.input<typeof RubitimeConfigSchema> {
  loadIntegrationEnv(__dirname, 'RUBITIME_');
  return {
    apiKey: process.env.RUBITIME_API_KEY?.trim() ?? '',
    webhookToken: process.env.RUBITIME_WEBHOOK_TOKEN?.trim() ?? '',
  };
}

export const rubitimeConfig = defineIntegrationConfig(
  'rubitime',
  RubitimeConfigSchema,
  loadRubitimeConfigFromEnv(),
);
