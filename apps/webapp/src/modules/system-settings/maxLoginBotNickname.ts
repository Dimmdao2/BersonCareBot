import { CHANNEL_LIST } from "@/modules/channel-preferences/constants";
import { env } from "@/config/env";
import { getConfigValue } from "@/modules/system-settings/configAdapter";

/**
 * Нормализует ник бота MAX для пути `https://max.ru/<nick>?start=…`.
 * Допускается вставка полной ссылки `https://max.ru/id…_bot` (берётся первый сегмент пути).
 */
export function normalizeMaxBotNicknameInput(raw: string): string {
  let s = (raw ?? "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      const host = u.hostname.replace(/^www\./i, "").toLowerCase();
      if (host !== "max.ru") return "";
      const path = u.pathname.replace(/^\/+|\/+$/g, "");
      const first = path.split("/").filter(Boolean)[0];
      return first ? decodeURIComponent(first) : "";
    } catch {
      return "";
    }
  }
  return s.replace(/^@/, "").split("/").filter(Boolean)[0]?.trim() ?? "";
}

/** Ник из `CHANNEL_LIST` (карточка MAX в профиле / настройках каналов), если админка и env пусты. */
export function maxBotNicknameFromChannelList(): string {
  const openUrl = CHANNEL_LIST.find((c) => c.code === "max")?.openUrl?.trim() ?? "";
  return normalizeMaxBotNicknameInput(openUrl);
}

/**
 * Ник бота MAX для диплинков: admin `max_login_bot_nickname` → `MAX_LOGIN_BOT_NICKNAME` → ник из `CHANNEL_LIST` (max.openUrl).
 * См. https://dev.max.ru/docs/chatbots/bots-coding/prepare — `https://max.ru/<nick>?start=<payload>`.
 */
export async function getMaxLoginBotNickname(): Promise<string> {
  const fromConstants = maxBotNicknameFromChannelList();
  const envFallback = normalizeMaxBotNicknameInput(env.MAX_LOGIN_BOT_NICKNAME ?? "");
  const combinedFallback = envFallback || fromConstants;
  const resolved = await getConfigValue("max_login_bot_nickname", combinedFallback);
  const n = normalizeMaxBotNicknameInput(resolved);
  if (n.length > 0) return n;
  return fromConstants;
}
