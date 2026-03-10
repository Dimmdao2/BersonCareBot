import { z } from 'zod';
import { defineIntegrationConfig } from '../config.js';

const MaxConfigSchema = z.object({
  enabled: z.boolean(),
  apiKey: z.string(),
  webhookSecret: z.string(),
  botId: z.string(),
});

export const maxConfig = defineIntegrationConfig('max', MaxConfigSchema, {
  enabled: false,
  apiKey: '',
  webhookSecret: '',
  botId: '',
});
