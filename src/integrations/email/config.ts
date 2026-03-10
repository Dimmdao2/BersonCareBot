import { z } from 'zod';
import { defineIntegrationConfig } from '../config.js';

const EmailConfigSchema = z.object({
  enabled: z.boolean(),
  provider: z.string(),
  apiKey: z.string(),
  fromAddress: z.string(),
});

export const emailConfig = defineIntegrationConfig('email', EmailConfigSchema, {
  enabled: false,
  provider: 'unset',
  apiKey: '',
  fromAddress: '',
});
