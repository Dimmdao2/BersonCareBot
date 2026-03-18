import { z } from 'zod';
import { defineIntegrationConfig } from '../config.js';

const VkConfigSchema = z.object({
  enabled: z.boolean(),
  groupId: z.string(),
  accessToken: z.string(),
  confirmationToken: z.string(),
});

export const vkConfig = defineIntegrationConfig('vk', VkConfigSchema, {
  enabled: false,
  groupId: '',
  accessToken: '',
  confirmationToken: '',
});
