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
    CONTENT_SERVICE_BASE_URL: z.string().optional().default(''),
    CONTENT_ACCESS_HMAC_SECRET: z.string().optional().default(''),
    APP_BASE_URL: z.string().url().optional(),
    INTEGRATOR_SHARED_SECRET: z.string().min(16).optional(),
  })
  .parse(process.env);

/** Нормализованные и валидированные переменные окружения. */
export const env = parsed;
