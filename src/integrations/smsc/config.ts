/* eslint-disable no-secrets/no-secrets */
import { z } from 'zod';
import { defineIntegrationConfig } from '../config.js';

const SmscConfigSchema = z.object({
  enabled: z.boolean(),
  apiKey: z.string().min(1),
  baseUrl: z.string().url(),
});

export const smscConfig = defineIntegrationConfig('smsc', SmscConfigSchema, {
  enabled: true,
  apiKey: '4dg8lj-s0$4z3M4c3A1t1H8w2P3x6M34d',
  baseUrl: 'https://smsc.ru/sys/send.php',
});
