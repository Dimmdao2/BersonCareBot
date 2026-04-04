import { env } from "@/config/env";
import { getConfigValue } from "@/modules/system-settings/configAdapter";

/** Имя бота для Telegram Login Widget (`data-telegram-login`), без `@`. */
export async function getTelegramLoginBotUsername(): Promise<string> {
  const fallback = env.TELEGRAM_BOT_USERNAME.replace(/^@/, "").trim() || "bersoncare_bot";
  const raw = await getConfigValue("telegram_login_bot_username", fallback);
  const s = typeof raw === "string" ? raw.trim().replace(/^@/, "") : "";
  return s.length > 0 ? s : fallback;
}
