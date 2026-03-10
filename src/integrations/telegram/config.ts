/* eslint-disable no-secrets/no-secrets */
import { z } from 'zod';
import { defineIntegrationConfig } from '../config.js';

const TelegramConfigSchema = z.object({
  botToken: z.string().min(1),
  adminTelegramId: z.number().int(),
  webhookSecret: z.string().min(1).optional(),
});

export const telegramConfig = defineIntegrationConfig('telegram', TelegramConfigSchema, {
  botToken: '8368481751:AAHGvjJfvYKD-XM2vRIx1D2hxbUmzKO2EAk',
  adminTelegramId: 364943522,
  webhookSecret: '9f3c7b1a6e4d2c8a',
});
