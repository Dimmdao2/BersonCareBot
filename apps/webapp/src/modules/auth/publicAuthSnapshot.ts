/**
 * Серверный снимок публичных конфигов входа для `/app` без лишних client fetch.
 * Логика совпадает с GET `/api/auth/oauth/providers`, `/api/auth/telegram-login/config`, `/api/auth/login/alternatives-config`.
 */
import { isOAuthProviderEnabled } from '@/modules/auth/authChannelPolicy';
import { getLoginAlternativesPublicConfig } from '@/modules/auth/loginAlternativesConfig';
import { getSpecialistSignupEnabled } from '@/modules/auth/specialistSignupRollout';
import type { PrefetchedPublicAuthConfig } from '@/shared/ui/patient/auth/AuthFlowV2';

export async function buildPrefetchedPublicAuthConfig(): Promise<PrefetchedPublicAuthConfig> {
  const [yandex, google, alt, specialistSignupEnabled] = await Promise.all([
    isOAuthProviderEnabled('yandex'),
    isOAuthProviderEnabled('google'),
    getLoginAlternativesPublicConfig(),
    getSpecialistSignupEnabled(),
  ]);

  return {
    oauthProviders: { yandex, google, apple: false },
    telegramBotUsername: alt.telegramBotUsername,
    maxBotOpenUrl: alt.maxBotOpenUrl,
    specialistSignupEnabled,
    authChannelPolicy: alt.authChannelPolicy,
    fetchedAt: Date.now(),
  };
}
