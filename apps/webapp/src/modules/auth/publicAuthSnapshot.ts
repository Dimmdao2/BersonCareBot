/**
 * Серверный снимок публичных конфигов входа для `/app` без лишних client fetch.
 * Логика совпадает с GET `/api/auth/oauth/providers`, `/api/auth/telegram-login/config`, `/api/auth/login/alternatives-config`.
 */
import { getPublicRuntimeBool } from '@/modules/system-settings/configAdapter';
import { isOAuthProviderEnabled } from '@/modules/auth/authChannelPolicy';
import { getLoginAlternativesPublicConfig } from '@/modules/auth/loginAlternativesConfig';
import { getSpecialistSignupEnabled } from '@/modules/auth/specialistSignupRollout';
import type { PrefetchedPublicAuthConfig } from '@/shared/ui/patient/auth/AuthFlowV2';

export async function buildPrefetchedPublicAuthConfig(): Promise<PrefetchedPublicAuthConfig> {
  const [yandex, google, apple, alt, specialistSignupEnabled] = await Promise.all([
    isOAuthProviderEnabled('yandex'),
    isOAuthProviderEnabled('google'),
    getPublicRuntimeBool('oauth_apple_enabled'),
    getLoginAlternativesPublicConfig(),
    getSpecialistSignupEnabled(),
  ]);

  return {
    oauthProviders: { yandex, google, apple },
    telegramBotUsername: alt.telegramBotUsername,
    maxBotOpenUrl: alt.maxBotOpenUrl,
    specialistSignupEnabled,
    authChannelPolicy: alt.authChannelPolicy,
    fetchedAt: Date.now(),
  };
}
