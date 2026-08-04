/**
 * Серверный снимок публичных конфигов входа для `/app` без лишних client fetch.
 * Логика совпадает с GET `/api/auth/oauth/providers`, `/api/auth/telegram-login/config`, `/api/auth/login/alternatives-config`.
 */
import { isOAuthProviderEnabled } from '@/modules/auth/authChannelPolicy';
import { isIndependentAuthMethodEnabled } from '@/modules/auth/authChannelPolicy';
import { getAnonymousLoginAlternativesPublicConfig } from '@/modules/auth/loginAlternativesConfig';
import { getSpecialistSignupEnabled } from '@/modules/auth/specialistSignupRollout';
import { OAUTH_PROVIDERS, type OAuthProviderFlags } from '@/modules/auth/oauthProviderRegistry';
import type { PrefetchedPublicAuthConfig } from '@/shared/ui/patient/auth/AuthFlowV2';

export async function buildPrefetchedPublicAuthConfig(): Promise<PrefetchedPublicAuthConfig> {
  const [oauthEntries, passkeyEnabled, alt, specialistSignupEnabled] = await Promise.all([
    Promise.all(
      OAUTH_PROVIDERS.map(
        async (provider) => [provider, await isOAuthProviderEnabled(provider)] as const,
      ),
    ),
    isIndependentAuthMethodEnabled('passkey'),
    getAnonymousLoginAlternativesPublicConfig(),
    getSpecialistSignupEnabled(),
  ]);
  const oauthProviders = Object.fromEntries(oauthEntries) as OAuthProviderFlags;

  return {
    oauthProviders,
    passkeyEnabled,
    telegramBotUsername: alt.telegramBotUsername,
    maxBotOpenUrl: alt.maxBotOpenUrl,
    specialistSignupEnabled,
    authChannelPolicy: alt.authChannelPolicy,
    fetchedAt: Date.now(),
  };
}
