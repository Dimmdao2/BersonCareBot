import { isSafeExternalHref } from "@/lib/url/isSafeExternalHref";
import { getConfigValue, getSmsFallbackEnabled } from "@/modules/system-settings/configAdapter";
import { getMaxLoginBotNickname, normalizeMaxBotNicknameInput } from "@/modules/system-settings/maxLoginBotNickname";
import { getTelegramLoginBotUsername } from "@/modules/system-settings/telegramLoginBotUsername";

export type LoginAlternativesPublicConfig = {
  telegramBotUsername: string | null;
  /** Открыть чат с ботом в Max (без одноразового токена — вход завершается в боте / по ссылке из бота). */
  maxBotOpenUrl: string | null;
  /** Ссылка из кабинета VK (OAuth, VK ID, vk.me и т.д.). */
  vkWebLoginUrl: string | null;
  /** Глобальный флаг SMS fallback (`sms_fallback_enabled`, doctor→admin fallback в БД). */
  smsFallbackEnabled: boolean;
};

/** Публичные URL для экрана входа (Max, VK и т.д.), без секретов. */
export async function getLoginAlternativesPublicConfig(): Promise<LoginAlternativesPublicConfig> {
  // Do NOT expose Telegram Login as an active public provider on the public login screen.
  // Keep internal `/api/auth/telegram-login/config` unchanged for authenticated flows.
  // We still call the system-settings getter to avoid side-effects in tests/env, but we will not
  // propagate the username to the public config.
  await getTelegramLoginBotUsername();
  const nick = normalizeMaxBotNicknameInput(await getMaxLoginBotNickname());
  const maxBotOpenUrl =
    nick.length > 0 ? `https://max.ru/${encodeURIComponent(nick)}` : null;

  const vkRaw = (await getConfigValue("vk_web_login_url", "")).trim();
  const vkWebLoginUrl = vkRaw.length > 0 && isSafeExternalHref(vkRaw) ? vkRaw : null;

  const smsFallbackEnabled = await getSmsFallbackEnabled();

  return {
    telegramBotUsername: null,
    maxBotOpenUrl,
    vkWebLoginUrl,
    smsFallbackEnabled,
  };
}
