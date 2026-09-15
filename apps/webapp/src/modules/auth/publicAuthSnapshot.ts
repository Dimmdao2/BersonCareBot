/**
 * Серверный снимок публичных конфигов входа для `/app` без лишних client fetch.
 * Это единственная проекция публичной auth-конфигурации для экрана входа.
 * Клиент получает только перечисленные ниже public-поля через RSC props.
 */
import { isOAuthProviderEnabled } from '@/modules/auth/authChannelPolicy';
import { isIndependentAuthMethodEnabled } from '@/modules/auth/authChannelPolicy';
import { getAnonymousLoginAlternativesPublicConfig } from '@/modules/auth/loginAlternativesConfig';
import { getSpecialistSignupEnabled } from '@/modules/auth/specialistSignupRollout';
import { OAUTH_PROVIDERS, type OAuthProviderFlags } from '@/modules/auth/oauthProviderRegistry';
import type { PrefetchedPublicAuthConfig } from '@/shared/ui/patient/auth/AuthFlowV2';
import type { SurfaceAuthPolicyName } from '@/shared/lib/surface/surfaceAuthPolicy';

export async function buildPrefetchedPublicAuthConfig(
  surface?: SurfaceAuthPolicyName,
): Promise<PrefetchedPublicAuthConfig> {
  const [oauthEntries, passkeyEnabled, alt, specialistSignupEnabled] = await Promise.all([
    Promise.all(
      OAUTH_PROVIDERS.map(
        async (provider) => [provider, await isOAuthProviderEnabled(provider, surface)] as const,
      ),
    ),
    isIndependentAuthMethodEnabled('passkey', surface),
    getAnonymousLoginAlternativesPublicConfig(surface),
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
