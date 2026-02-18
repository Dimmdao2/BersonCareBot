import { z } from 'zod';

export const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  TG_WEBHOOK_SECRET: z.string(),
  // Добавьте другие переменные окружения по необходимости
});

export type EnvPayload = z.infer<typeof EnvSchema>;
