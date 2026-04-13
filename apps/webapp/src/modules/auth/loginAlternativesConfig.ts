import { isSafeExternalHref } from "@/lib/url/isSafeExternalHref";
import { getConfigValue } from "@/modules/system-settings/configAdapter";
import { getMaxLoginBotNickname, normalizeMaxBotNicknameInput } from "@/modules/system-settings/maxLoginBotNickname";
import { getTelegramLoginBotUsername } from "@/modules/system-settings/telegramLoginBotUsername";

export type LoginAlternativesPublicConfig = {
  telegramBotUsername: string | null;
  /** Открыть чат с ботом в Max (без одноразового токена — вход завершается в боте / по ссылке из бота). */
  maxBotOpenUrl: string | null;
  /** Ссылка из кабинета VK (OAuth, VK ID, vk.me и т.д.). */
  vkWebLoginUrl: string | null;
};

/** Публичные URL для экрана входа (Max, VK и т.д.), без секретов. */
export async function getLoginAlternativesPublicConfig(): Promise<LoginAlternativesPublicConfig> {
  const tgRaw = (await getTelegramLoginBotUsername()).trim().replace(/^@/, "");
  const nick = normalizeMaxBotNicknameInput(await getMaxLoginBotNickname());
  const maxBotOpenUrl =
    nick.length > 0 ? `https://max.ru/${encodeURIComponent(nick)}` : null;

  const vkRaw = (await getConfigValue("vk_web_login_url", "")).trim();
  const vkWebLoginUrl = vkRaw.length > 0 && isSafeExternalHref(vkRaw) ? vkRaw : null;

  return {
    telegramBotUsername: tgRaw.length > 0 ? tgRaw : null,
    maxBotOpenUrl,
    vkWebLoginUrl,
  };
}
