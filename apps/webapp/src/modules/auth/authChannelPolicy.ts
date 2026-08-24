import {
  getPublicAuthChannelConfigured,
  getPublicRuntimeBool,
} from '@/modules/system-settings/configAdapter';
import { OAUTH_PROVIDERS, type OAuthProvider } from '@/modules/auth/oauthProviderRegistry';
import type { SurfaceAuthPolicyName } from '@/shared/lib/surface/requestSurface';
import { getOptionalResolvedSurface } from '@/shared/lib/surface/requestSurface.server';
import {
  authPolicyNameForRequestSurface,
  surfaceAuthSettingKey,
  type SurfaceAuthControl,
} from './surfaceAuthSettings';

export type AuthChannel = 'email' | 'sms' | 'telegram' | 'max';

export type AuthChannelPolicy = Readonly<Record<AuthChannel, boolean>>;

export const AUTH_CHANNEL_DISABLED_ERROR = 'auth_channel_disabled' as const;

async function currentSurfacePolicyName(
  explicit?: SurfaceAuthPolicyName,
): Promise<SurfaceAuthPolicyName | null> {
  if (explicit) return explicit;
  try {
    const resolved = await getOptionalResolvedSurface();
    return resolved ? authPolicyNameForRequestSurface(resolved.surface) : null;
  } catch {
    return null;
  }
}

async function getSurfaceAwareToggle(
  control: SurfaceAuthControl,
  explicitSurface?: SurfaceAuthPolicyName,
): Promise<boolean> {
  const surface = await currentSurfacePolicyName(explicitSurface);
  if (!surface) return false;
  return getPublicRuntimeBool(surfaceAuthSettingKey(surface, control), 'public_auth_config');
}

/** Admin toggle only — unchanged contract (pre-existing, ~30 server-enforcing routes rely on this). */
export async function isAuthChannelEnabled(
  channel: AuthChannel,
  surface?: SurfaceAuthPolicyName,
): Promise<boolean> {
  return getSurfaceAwareToggle(channel, surface);
}

export async function getAuthChannelPolicy(
  surface?: SurfaceAuthPolicyName,
): Promise<AuthChannelPolicy> {
  const [email, sms, telegram, max] = await Promise.all([
    isAuthChannelEnabled('email', surface),
    isAuthChannelEnabled('sms', surface),
    isAuthChannelEnabled('telegram', surface),
    isAuthChannelEnabled('max', surface),
  ]);
  return { email, sms, telegram, max };
}

/**
 * Effective client visibility = admin toggle AND configured (owner ruling 2026-07-24). Use this,
 * not {@link getAuthChannelPolicy}, when building what the patient/staff login screen shows. The
 * configured answers come only from boolean SECURITY DEFINER capabilities; credential-backed
 * admin detail lives in a separate module.
 */
export async function getClientVisibleAuthChannelPolicy(
  surface?: SurfaceAuthPolicyName,
): Promise<AuthChannelPolicy> {
  const channels: readonly AuthChannel[] = ['email', 'sms', 'telegram', 'max'];
  const entries = await Promise.all(
    channels.map(async (channel) => {
      const [enabled, configured] = await Promise.all([
        isAuthChannelEnabled(channel, surface),
        getPublicAuthChannelConfigured(channel),
      ]);
      return [channel, enabled && configured] as const;
    }),
  );
  return Object.fromEntries(entries) as AuthChannelPolicy;
}

/**
 * OAuth login providers. Each provider has an independent admin toggle, and the provider is
 * effective only when its complete credential set exists.
 * The independent admin toggle (`auth_oauth_*_enabled`) is decoupled from credential presence.
 * "Configured" is the credential-derived public projection maintained by the DB trigger.
 */
export type { OAuthProvider };
export type OAuthProviderDetail = Readonly<{ enabled: boolean; configured: boolean }>;
export type OAuthProviderPolicyDetail = Readonly<Record<OAuthProvider, OAuthProviderDetail>>;

const OAUTH_CONFIGURED_SETTING_BY_PROVIDER = {
  google: 'oauth_google_enabled',
  yandex: 'oauth_yandex_enabled',
  apple: 'oauth_apple_enabled',
  vk: 'oauth_vk_enabled',
} as const;

async function isOAuthProviderConfigured(provider: OAuthProvider): Promise<boolean> {
  return getPublicRuntimeBool(OAUTH_CONFIGURED_SETTING_BY_PROVIDER[provider], 'public_auth_config');
}

/** Effective OAuth login availability = admin toggle AND configured. Fail-closed either way. */
export async function isOAuthProviderEnabled(
  provider: OAuthProvider,
  surface?: SurfaceAuthPolicyName,
): Promise<boolean> {
  const [enabled, configured] = await Promise.all([
    getSurfaceAwareToggle(`oauth_${provider}`, surface),
    isOAuthProviderConfigured(provider),
  ]);
  return enabled && configured;
}

/** Admin-only detail view for the OAuth toggles (raw toggle + configuration status). */
export async function getOAuthProviderPolicyDetail(
  surface?: SurfaceAuthPolicyName,
): Promise<OAuthProviderPolicyDetail> {
  const entries = await Promise.all(
    OAUTH_PROVIDERS.map(async (provider) => {
      const [enabled, configured] = await Promise.all([
        getSurfaceAwareToggle(`oauth_${provider}`, surface),
        isOAuthProviderConfigured(provider),
      ]);
      return [provider, { enabled, configured }] as const;
    }),
  );
  return Object.fromEntries(entries) as OAuthProviderPolicyDetail;
}

export type IndependentAuthMethod = 'passkey';

/** Server-side gate for independent login methods; false is the safe default for both. */
export async function isIndependentAuthMethodEnabled(
  method: IndependentAuthMethod,
  surface?: SurfaceAuthPolicyName,
): Promise<boolean> {
  return getSurfaceAwareToggle(method, surface);
}
