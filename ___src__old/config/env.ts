import { z } from "zod";

/** Единственный источник переменных окружения. dotenv загружается в main.ts до импорта приложения. */
const parsed = z
  .object({
    NODE_ENV: z.string().default("production"),
    HOST: z.string().default("127.0.0.1"),
    PORT: z.coerce.number().default(3000),
    LOG_LEVEL: z.string().default("info"),

    DATABASE_URL: z.string().min(1),

    BOOKING_URL: z.string().min(1),

    /** Telegram */
    TG_WEBHOOK_SECRET: z.string().optional(),
    BOT_TOKEN: z.string().min(1),
    ADMIN_TELEGRAM_ID: z.string().min(1),
    INBOX_CHAT_ID: z.string().min(1),

    /** SMSC.RU */
    SMSC_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
    SMSC_API_KEY: z.string().optional(),
    SMSC_API_BASE_URL: z.string().url().default('https://smsc.ru/sys/send.php'),

    /** Токен для входящего webhook Rubitime (path /webhook/rubitime/:token). Обязательный. */
    RUBITIME_WEBHOOK_TOKEN: z.string().min(1),
    RUBITIME_REQSUCCESS_WINDOW_MINUTES: z.coerce.number().int().positive().default(20),
    RUBITIME_REQSUCCESS_DELAY_MIN_MS: z.coerce.number().int().nonnegative().default(100),
    RUBITIME_REQSUCCESS_DELAY_MAX_MS: z.coerce.number().int().positive().default(200),
    RUBITIME_REQSUCCESS_IP_LIMIT_PER_MIN: z.coerce.number().int().positive().default(5),
    RUBITIME_REQSUCCESS_GLOBAL_LIMIT_PER_MIN: z.coerce.number().int().positive().default(120),
  })
  .parse(process.env);

export const env = parsed;