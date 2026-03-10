import { z } from 'zod';

/**
 * Единый реестр переменных окружения.
 * Значения валидируются при старте приложения.
 */
const parsed = z
  .object({
    NODE_ENV: z.string().default('production'),
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().default(3000),
    LOG_LEVEL: z.string().default('info'),

    DATABASE_URL: z.string().min(1),

    BOOKING_URL: z.string().min(1),
  })
  .parse(process.env);

/** Нормализованные и валидированные переменные окружения. */
export const env = parsed;
