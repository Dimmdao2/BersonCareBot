/**
 * Серверный снимок публичных конфигов входа для `/app` без лишних client fetch.
 * Логика совпадает с GET `/api/auth/oauth/providers`, `/api/auth/telegram-login/config`, `/api/auth/login/alternatives-config`.
 */
import { isOAuthProviderEnabled } from '@/modules/auth/authChannelPolicy';
import { isIndependentAuthMethodEnabled } from '@/modules/auth/authChannelPolicy';
import { getAnonymousLoginAlternativesPublicConfig } from '@/modules/auth/loginAlternativesConfig';
import { getSpecialistSignupEnabled } from '@/modules/auth/specialistSignupRollout';
import type { PrefetchedPublicAuthConfig } from '@/shared/ui/patient/auth/AuthFlowV2';

export async function buildPrefetchedPublicAuthConfig(): Promise<PrefetchedPublicAuthConfig> {
  const [yandex, google, apple, passkeyEnabled, alt, specialistSignupEnabled] = await Promise.all([
    isOAuthProviderEnabled('yandex'),
    isOAuthProviderEnabled('google'),
    isOAuthProviderEnabled('apple'),
    isIndependentAuthMethodEnabled('passkey'),
    getAnonymousLoginAlternativesPublicConfig(),
    getSpecialistSignupEnabled(),
  ]);

  return {
    oauthProviders: { yandex, google, apple },
    passkeyEnabled,
    telegramBotUsername: alt.telegramBotUsername,
    maxBotOpenUrl: alt.maxBotOpenUrl,
    specialistSignupEnabled,
    authChannelPolicy: alt.authChannelPolicy,
    fetchedAt: Date.now(),
  };
}
