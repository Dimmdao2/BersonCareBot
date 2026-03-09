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

    /** Telegram */
    TG_WEBHOOK_SECRET: z.string().optional(),
    BOT_TOKEN: z.string().min(1),
    ADMIN_TELEGRAM_ID: z.string().min(1),

    /** SMSC.RU */
    SMSC_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
    SMSC_API_KEY: z.string().optional(),
    SMSC_API_BASE_URL: z.string().url().default('https://smsc.ru/sys/send.php'),

    /** Токен входящего webhook Rubitime (path: /webhook/rubitime/:token). */
    RUBITIME_WEBHOOK_TOKEN: z.string().min(1),
  })
  .parse(process.env);

/** Нормализованные и валидированные переменные окружения. */
export const env = parsed;
