import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.string().default('info'),
  BOT_TOKEN: z.string().optional(),
  ADMIN_TELEGRAM_ID: z.string().optional(),
  INBOX_CHAT_ID: z.string().optional(),
  BOOKING_URL: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  TG_WEBHOOK_SECRET: z.string().optional(),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid environment variables:', _env.error.format());
  process.exit(1);
}

export const env = _env.data;
export type Env = typeof env;
