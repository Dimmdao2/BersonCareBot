/**
 * Серверный снимок публичных конфигов входа для `/app` без лишних client fetch.
 * Логика совпадает с GET `/api/auth/oauth/providers`, `/api/auth/telegram-login/config`, `/api/auth/login/alternatives-config`.
 */
import {
  getAppleOauthClientId,
  getAppleOauthKeyId,
  getAppleOauthPrivateKey,
  getAppleOauthRedirectUri,
  getAppleOauthTeamId,
  getGoogleClientId,
  getGoogleClientSecret,
  getGoogleOauthLoginRedirectUri,
  getYandexOauthClientId,
  getYandexOauthClientSecret,
  getYandexOauthRedirectUri,
} from "@/modules/system-settings/integrationRuntime";
import { getLoginAlternativesPublicConfig } from "@/modules/auth/loginAlternativesConfig";
import type { PrefetchedPublicAuthConfig } from "@/shared/ui/auth/AuthFlowV2";

export async function buildPrefetchedPublicAuthConfig(): Promise<PrefetchedPublicAuthConfig> {
  const [yId, ySec, yRedir, gId, gSec, gLogin, aId, aRedir, aTeam, aKid, aPem, alt] = await Promise.all([
    getYandexOauthClientId(),
    getYandexOauthClientSecret(),
    getYandexOauthRedirectUri(),
    getGoogleClientId(),
    getGoogleClientSecret(),
    getGoogleOauthLoginRedirectUri(),
    getAppleOauthClientId(),
    getAppleOauthRedirectUri(),
    getAppleOauthTeamId(),
    getAppleOauthKeyId(),
    getAppleOauthPrivateKey(),
    getLoginAlternativesPublicConfig(),
  ]);

  const yandex = yId.trim().length > 0 && ySec.trim().length > 0 && yRedir.trim().length > 0;
  const google = gId.trim().length > 0 && gSec.trim().length > 0 && gLogin.trim().length > 0;
  const apple =
    aId.trim().length > 0 &&
    aRedir.trim().length > 0 &&
    aTeam.trim().length > 0 &&
    aKid.trim().length > 0 &&
    aPem.trim().length > 0;

  return {
    oauthProviders: { yandex, google, apple },
    telegramBotUsername: alt.telegramBotUsername,
    maxBotOpenUrl: alt.maxBotOpenUrl,
    fetchedAt: Date.now(),
  };
}
