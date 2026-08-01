import { isSafeExternalHref } from '@/lib/url/isSafeExternalHref';
import {
  getPublicRuntimeBool,
  getPublicRuntimeValue,
} from '@/modules/system-settings/configAdapter';
import { normalizeMaxBotNicknameInput } from '@/modules/system-settings/maxLoginBotNickname';
import {
  getClientVisibleAuthChannelPolicy,
  type AuthChannelPolicy,
} from '@/modules/auth/authChannelPolicy';
import { getAnonymousClientVisibleAuthChannelPolicy } from '@/modules/auth/anonymousAuthChannelPolicy';

export type LoginAlternativesPublicConfig = {
  telegramBotUsername: string | null;
  /** Открыть чат с ботом в Max (без одноразового токена — вход завершается в боте / по ссылке из бота). */
  maxBotOpenUrl: string | null;
  /** Ссылка из кабинета VK (OAuth, VK ID, vk.me и т.д.). */
  vkWebLoginUrl: string | null;
  /** Глобальный флаг SMS fallback (`sms_fallback_enabled`, doctor→admin fallback в БД). */
  smsFallbackEnabled: boolean;
  authChannelPolicy: AuthChannelPolicy;
};

async function buildLoginAlternativesPublicConfig(
  authChannelPolicy: Promise<AuthChannelPolicy>,
): Promise<LoginAlternativesPublicConfig> {
  // Do NOT expose Telegram Login as an active public provider on the public login screen.
  // Keep internal `/api/auth/telegram-login/config` unchanged for authenticated flows and do not
  // propagate the Telegram username through this public alternatives payload.
  const [maxNickname, vkSetting, smsFallbackEnabled, resolvedAuthChannelPolicy] = await Promise.all([
    getPublicRuntimeValue('max_login_bot_nickname'),
    getPublicRuntimeValue('vk_web_login_url'),
    getPublicRuntimeBool('public_sms_fallback_enabled'),
    authChannelPolicy,
  ]);
  const nick = normalizeMaxBotNicknameInput(maxNickname);
  const maxBotOpenUrl = nick.length > 0 ? `https://max.ru/${encodeURIComponent(nick)}` : null;

  const vkRaw = vkSetting.trim();
  const vkWebLoginUrl = vkRaw.length > 0 && isSafeExternalHref(vkRaw) ? vkRaw : null;

  return {
    telegramBotUsername: null,
    maxBotOpenUrl,
    vkWebLoginUrl,
    smsFallbackEnabled,
    authChannelPolicy: resolvedAuthChannelPolicy,
  };
}

/** Public API path with a stamped bootstrap principal. */
export function getLoginAlternativesPublicConfig(): Promise<LoginAlternativesPublicConfig> {
  return buildLoginAlternativesPublicConfig(getClientVisibleAuthChannelPolicy());
}

/** Anonymous RSC path: only public projections/capabilities are in its dependency graph. */
export function getAnonymousLoginAlternativesPublicConfig(): Promise<LoginAlternativesPublicConfig> {
  return buildLoginAlternativesPublicConfig(getAnonymousClientVisibleAuthChannelPolicy());
}
