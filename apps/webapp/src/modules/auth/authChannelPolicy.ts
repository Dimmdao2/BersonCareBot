import {
  getPublicAuthChannelConfigured,
  getPublicRuntimeBool,
} from '@/modules/system-settings/configAdapter';

export type AuthChannel = 'email' | 'sms' | 'telegram' | 'max';

export type AuthChannelPolicy = Readonly<Record<AuthChannel, boolean>>;

export const AUTH_CHANNEL_DISABLED_ERROR = 'auth_channel_disabled' as const;

const SETTING_BY_CHANNEL = {
  email: 'auth_email_enabled',
  sms: 'auth_sms_enabled',
  telegram: 'auth_telegram_enabled',
  max: 'auth_max_enabled',
} as const;

/** Admin toggle only — unchanged contract (pre-existing, ~30 server-enforcing routes rely on this). */
export async function isAuthChannelEnabled(channel: AuthChannel): Promise<boolean> {
  return getPublicRuntimeBool(SETTING_BY_CHANNEL[channel], 'public_auth_config');
}

export async function getAuthChannelPolicy(): Promise<AuthChannelPolicy> {
  const [email, sms, telegram, max] = await Promise.all([
    isAuthChannelEnabled('email'),
    isAuthChannelEnabled('sms'),
    isAuthChannelEnabled('telegram'),
    isAuthChannelEnabled('max'),
  ]);
  return { email, sms, telegram, max };
}

/**
 * Effective client visibility = admin toggle AND configured (owner ruling 2026-07-24). Use this,
 * not {@link getAuthChannelPolicy}, when building what the patient/staff login screen shows. The
 * configured answers come only from boolean SECURITY DEFINER capabilities; credential-backed
 * admin detail lives in a separate module.
 */
export async function getClientVisibleAuthChannelPolicy(): Promise<AuthChannelPolicy> {
  const channels: readonly AuthChannel[] = ['email', 'sms', 'telegram', 'max'];
  const entries = await Promise.all(
    channels.map(async (channel) => {
      const [enabled, configured] = await Promise.all([
        isAuthChannelEnabled(channel),
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
export type OAuthProvider = 'google' | 'yandex' | 'apple' | 'vk';
export type OAuthProviderDetail = Readonly<{ enabled: boolean; configured: boolean }>;
export type OAuthProviderPolicyDetail = Readonly<Record<OAuthProvider, OAuthProviderDetail>>;

const OAUTH_TOGGLE_SETTING_BY_PROVIDER = {
  google: 'auth_oauth_google_enabled',
  yandex: 'auth_oauth_yandex_enabled',
  apple: 'auth_oauth_apple_enabled',
  vk: 'auth_oauth_vk_enabled',
} as const;

const OAUTH_CONFIGURED_SETTING_BY_PROVIDER = {
  google: 'oauth_google_enabled',
  yandex: 'oauth_yandex_enabled',
  apple: 'oauth_apple_enabled',
  vk: 'oauth_vk_enabled',
} as const;

async function isOAuthProviderConfigured(provider: OAuthProvider): Promise<boolean> {
  return getPublicRuntimeBool(
    OAUTH_CONFIGURED_SETTING_BY_PROVIDER[provider],
    'public_auth_config',
  );
}

/** Effective OAuth login availability = admin toggle AND configured. Fail-closed either way. */
export async function isOAuthProviderEnabled(provider: OAuthProvider): Promise<boolean> {
  const [enabled, configured] = await Promise.all([
    getPublicRuntimeBool(OAUTH_TOGGLE_SETTING_BY_PROVIDER[provider], 'public_auth_config'),
    isOAuthProviderConfigured(provider),
  ]);
  return enabled && configured;
}

/** Admin-only detail view for the OAuth toggles (raw toggle + configuration status). */
export async function getOAuthProviderPolicyDetail(): Promise<OAuthProviderPolicyDetail> {
  const providers: readonly OAuthProvider[] = ['google', 'yandex', 'apple', 'vk'];
  const entries = await Promise.all(
    providers.map(async (provider) => {
      const [enabled, configured] = await Promise.all([
        getPublicRuntimeBool(OAUTH_TOGGLE_SETTING_BY_PROVIDER[provider], 'public_auth_config'),
        isOAuthProviderConfigured(provider),
      ]);
      return [provider, { enabled, configured }] as const;
    }),
  );
  return Object.fromEntries(entries) as OAuthProviderPolicyDetail;
}

export type IndependentAuthMethod = 'passkey';

const AUTH_METHOD_TOGGLE_SETTING = {
  passkey: 'auth_passkey_enabled',
} as const;

/** Server-side gate for independent login methods; false is the safe default for both. */
export async function isIndependentAuthMethodEnabled(
  method: IndependentAuthMethod,
): Promise<boolean> {
  return getPublicRuntimeBool(AUTH_METHOD_TOGGLE_SETTING[method], 'public_auth_config');
}
