import { z } from 'zod';
import { defineIntegrationConfig } from '../config.js';

const InstagramConfigSchema = z.object({
  enabled: z.boolean(),
  appId: z.string(),
  appSecret: z.string(),
  verifyToken: z.string(),
});

export const instagramConfig = defineIntegrationConfig('instagram', InstagramConfigSchema, {
  enabled: false,
  appId: '',
  appSecret: '',
  verifyToken: '',
});
