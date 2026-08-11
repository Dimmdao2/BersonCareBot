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
    /** Deployment ownership only: selects inbound transport, never provider credentials or policy. */
    TELEGRAM_MODE: z.enum(['webhook', 'long_polling']).optional().default('webhook'),
    /** Cutover-only deployment switch; never an admin-editable integration setting. */
    TELEGRAM_DELETE_WEBHOOK_ON_START: z
      .string()
      .optional()
      .transform((value) => /^(1|true|yes)$/i.test((value ?? '').trim())),

    DATABASE_URL: z.string().min(1),
    APP_BASE_URL: z
      .string()
      .url()
      .refine((value) => {
        try {
          const protocol = new URL(value).protocol;
          return protocol === 'http:' || protocol === 'https:';
        } catch {
          return false;
        }
      }, 'APP_BASE_URL must use the http or https protocol')
      .transform((value) => value.replace(/\/$/, '')),
    DB_PRINCIPAL_CONTEXT_MODE: z
      .enum(['legacy-guc', 'shadow', 'locked', 'port-context'])
      .optional()
      .default('legacy-guc'),
    DB_PRINCIPAL_SIGNING_SECRET: z
      .string()
      .optional()
      .transform((value) => (value ?? '').trim()),
    INTEGRATOR_DB_LOGIN: z.string().optional().transform((value) => (value ?? '').trim()),
    INTEGRATOR_DB_TLS_CA_FILE: z.string().optional().transform((value) => (value ?? '').trim()),
    INTEGRATOR_DB_TLS_CERT_FILE: z.string().optional().transform((value) => (value ?? '').trim()),
    INTEGRATOR_DB_TLS_KEY_FILE: z.string().optional().transform((value) => (value ?? '').trim()),
    INTEGRATOR_PORT_CONTEXT_CAPABILITIES_JSON: z.string().optional().transform((value) => (value ?? '').trim()),

    BOOKING_URL: z.string().min(1),
    CONTENT_SERVICE_BASE_URL: z.string().optional().default(''),
    CONTENT_ACCESS_HMAC_SECRET: z.string().optional().default(''),
    INTEGRATOR_SHARED_SECRET: z.string().min(16).optional(),
    /** Secret for signing webapp-entry token (?t=). Prefer over INTEGRATOR_SHARED_SECRET when set. */
    INTEGRATOR_WEBAPP_ENTRY_SECRET: z.string().min(16).optional(),
    /** Secret for webhook HMAC (outbound to webapp, inbound from webapp e.g. send-sms). Prefer over INTEGRATOR_SHARED_SECRET when set. */
    INTEGRATOR_WEBHOOK_SECRET: z.string().min(16).optional(),
  })
  .parse(process.env);

if (
  (parsed.DB_PRINCIPAL_CONTEXT_MODE === 'shadow' ||
    parsed.DB_PRINCIPAL_CONTEXT_MODE === 'locked') &&
  !parsed.DB_PRINCIPAL_SIGNING_SECRET
) {
  throw new Error(
    `DB_PRINCIPAL_SIGNING_SECRET is required when DB_PRINCIPAL_CONTEXT_MODE=${parsed.DB_PRINCIPAL_CONTEXT_MODE}.`,
  );
}

/** Нормализованные и валидированные переменные окружения. */
export const env = parsed;

/** Secret for building webapp-entry token. */
export const integratorWebappEntrySecret = (): string =>
  parsed.INTEGRATOR_WEBAPP_ENTRY_SECRET ?? parsed.INTEGRATOR_SHARED_SECRET ?? '';

/** Secret for webhook signing and verification (webapp M2M). */
export const integratorWebhookSecret = (): string =>
  parsed.INTEGRATOR_WEBHOOK_SECRET ?? parsed.INTEGRATOR_SHARED_SECRET ?? '';
