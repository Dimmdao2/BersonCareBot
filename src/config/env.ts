import { z } from "zod";

/** Единственный источник переменных окружения. dotenv загружается в main.ts до импорта приложения. */
export const env = z
  .object({
    NODE_ENV: z.string().default("production"),
    HOST: z.string().default("127.0.0.1"),
    PORT: z.coerce.number().default(3000),
    LOG_LEVEL: z.string().default("info"),

    BOT_TOKEN: z.string().min(1),
    ADMIN_TELEGRAM_ID: z.string().min(1),
    INBOX_CHAT_ID: z.string().min(1),
    BOOKING_URL: z.string().min(1),

    DATABASE_URL: z.string().min(1),
    TG_WEBHOOK_SECRET: z.string().optional(),
  })
  .parse(process.env);