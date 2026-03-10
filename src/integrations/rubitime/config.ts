import { z } from 'zod';
import { defineIntegrationConfig } from '../config.js';

const RubitimeConfigSchema = z.object({
  apiKey: z.string().min(1),
  webhookToken: z.string().min(1),
});

export const rubitimeConfig = defineIntegrationConfig('rubitime', RubitimeConfigSchema, {
  apiKey: '6d822b752f330a6f668d8f3011f2467a44016810a4c2b8378e99c5c851c47cc4',
  webhookToken: 'ddbfec5a665f5a4965db062a75c92aa377858d644a5f8a8742db0bc87371a0ae',
});
