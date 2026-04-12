import { env } from "@/config/env";
import { getConfigValue } from "@/modules/system-settings/configAdapter";

/**
 * Публичный username бота без `@` для Login Widget и `https://t.me/…`.
 * Не числовой id бота; канон — `telegram_login_bot_username` в БД, иначе fallback `env.TELEGRAM_BOT_USERNAME`.
 */
export async function getTelegramLoginBotUsername(): Promise<string> {
  const fallback = env.TELEGRAM_BOT_USERNAME.replace(/^@/, "").trim() || "bersoncare_bot";
  const raw = await getConfigValue("telegram_login_bot_username", fallback);
  const s = typeof raw === "string" ? raw.trim().replace(/^@/, "") : "";
  return s.length > 0 ? s : fallback;
}
