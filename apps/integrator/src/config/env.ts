import { z } from 'zod';

/**
 * Единый реестр переменных окружения.
 * Значения валидируются при старте приложения.
 * Secret separation: INTEGRATOR_WEBAPP_ENTRY_SECRET for ?t= tokens, INTEGRATOR_WEBHOOK_SECRET for webhook signing/verification; INTEGRATOR_SHARED_SECRET fallback for both when separate not set.
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
    /** Secret for signing webapp-entry token (?t=). Prefer over INTEGRATOR_SHARED_SECRET when set. */
    INTEGRATOR_WEBAPP_ENTRY_SECRET: z.string().min(16).optional(),
    /** Secret for webhook HMAC (outbound to webapp, inbound from webapp e.g. send-sms). Prefer over INTEGRATOR_SHARED_SECRET when set. */
    INTEGRATOR_WEBHOOK_SECRET: z.string().min(16).optional(),
    GOOGLE_CALENDAR_ENABLED: z
      .string()
      .optional()
      .default('false')
      .transform((value) => value.toLowerCase() === 'true'),
    GOOGLE_CLIENT_ID: z.string().optional().default(''),
    GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
    GOOGLE_REDIRECT_URI: z.string().optional().default(''),
    GOOGLE_CALENDAR_ID: z.string().optional().default(''),
    GOOGLE_REFRESH_TOKEN: z.string().optional().default(''),
    /**
     * Опциональный оверрайд минутного смещения UTC для наивных дат Rubitime без зоны.
     * Если не задан — смещение берётся из IANA display-timezone в `system_settings.app_display_timezone` (см. {@link getAppDisplayTimezone}).
     */
    RUBITIME_RECORD_AT_UTC_OFFSET_MINUTES: z.preprocess(
      (v) => (v === '' || v === undefined || v === null ? undefined : v),
      z.coerce.number().optional(),
    ),
  })
  .parse(process.env);

/** Нормализованные и валидированные переменные окружения. */
export const env = parsed;

/** Secret for building webapp-entry token. */
export const integratorWebappEntrySecret = (): string =>
  parsed.INTEGRATOR_WEBAPP_ENTRY_SECRET ?? parsed.INTEGRATOR_SHARED_SECRET ?? '';

/** Secret for webhook signing and verification (webapp M2M). */
export const integratorWebhookSecret = (): string =>
  parsed.INTEGRATOR_WEBHOOK_SECRET ?? parsed.INTEGRATOR_SHARED_SECRET ?? '';
