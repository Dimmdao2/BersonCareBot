import {
  getConfigValue,
  getIsSmtpOutboundConfiguredOrNull,
  getPublicRuntimeBool,
} from '@/modules/system-settings/configAdapter';
import {
  getGoogleClientId,
  getGoogleClientSecret,
  getGoogleOauthLoginRedirectUri,
  getAppleOauthClientId,
  getAppleOauthKeyId,
  getAppleOauthPrivateKey,
  getAppleOauthRedirectUri,
  getAppleOauthTeamId,
  getMaxBotApiKey,
  getTelegramBotToken,
  getYandexOauthClientId,
  getYandexOauthClientSecret,
  getYandexOauthRedirectUri,
} from '@/modules/system-settings/integrationRuntime';
import { smtpInnerFromValueJson } from '@/modules/system-settings/smtpOutboundPatch';

export type AuthChannel = 'email' | 'sms' | 'telegram' | 'max';

export type AuthChannelPolicy = Readonly<Record<AuthChannel, boolean>>;

/** Per-channel `{enabled, configured}` breakdown — for the admin UI warning, never for gating. */
export type AuthChannelDetail = Readonly<{ enabled: boolean; configured: boolean }>;
export type AuthChannelPolicyDetail = Readonly<Record<AuthChannel, AuthChannelDetail>>;

export const AUTH_CHANNEL_DISABLED_ERROR = 'auth_channel_disabled' as const;

const SETTING_BY_CHANNEL = {
  email: 'auth_email_enabled',
  sms: 'auth_sms_enabled',
  telegram: 'auth_telegram_enabled',
  max: 'auth_max_enabled',
} as const;

/**
 * "Is outbound e-mail configured?" — read via the whitelisted boolean-only SECURITY DEFINER
 * accessor `app.is_smtp_outbound_configured()` (migration 0240) FIRST. That accessor is reachable
 * from every DB role the public login screen runs as, including the unauthenticated bootstrap pool
 * this function is called from on every `GET /api/auth/login/alternatives-config` and
 * `POST /api/auth/check-phone` — unlike `getConfigValue("smtp_outbound", "")`, which resolves to a
 * direct table read of `system_settings` that role has no privilege for (FORCE RLS denies it,
 * 42501), silently swallowed by configAdapter.ts:fetchFromDb() into the env fallback `""`, so
 * the login screen never offered "code to e-mail" even with SMTP fully configured (bug fixed here).
 *
 * `getIsSmtpOutboundConfiguredOrNull()` never throws; it returns `null` only when the accessor
 * itself is unavailable (e.g. an older DB before migration 0240) or errors for any other reason. In
 * that case this function falls back to the legacy direct-read path below, which stays correct for
 * callers that DO hold table privilege (e.g. `app_staff` on the admin settings page) and — because
 * `getConfigValue`'s own `fetchFromDb` already swallows every DB error into `null` — can itself
 * never throw either. Net effect: this function can never crash the login screen into a 500.
 *
 * The outer try/catch is defense-in-depth: `getIsSmtpOutboundConfiguredOrNull()` already contracts
 * to never throw, but this function must hold that guarantee even if that contract is ever broken.
 */
async function isSmtpConfigured(): Promise<boolean> {
  let viaAccessor: boolean | null = null;
  try {
    viaAccessor = await getIsSmtpOutboundConfiguredOrNull();
  } catch {
    viaAccessor = null;
  }
  if (viaAccessor !== null) return viaAccessor;

  const raw = await getConfigValue('smtp_outbound', '');
  if (!raw.trim()) return false;
  try {
    return smtpInnerFromValueJson(JSON.parse(raw)).success === true;
  } catch {
    return false;
  }
}

async function isSmsProviderConfigured(): Promise<boolean> {
  const raw = await getConfigValue('smsc_api_key', '');
  return raw.trim().length > 0;
}

async function isTelegramBotConfigured(): Promise<boolean> {
  return (await getTelegramBotToken()).trim().length > 0;
}

async function isMaxBotConfigured(): Promise<boolean> {
  return (await getMaxBotApiKey()).trim().length > 0;
}

/**
 * Owner ruling 2026-07-24: a channel that is ON but whose credentials/config are absent is
 * treated as effectively unavailable from the CLIENT side — hidden from patient/staff login UI.
 * This is deliberately NOT folded into {@link isAuthChannelEnabled} / {@link getAuthChannelPolicy}:
 * those two are the pre-existing, already-shipped fail-closed gate used by ~30 server-enforcing
 * routes (email/sms/telegram/max), and stay toggle-only exactly as before — do not weaken/change
 * their contract. Client-facing "hide when unconfigured" is applied by the callers that build the
 * public login/registration surface (`loginAlternativesConfig.ts`, `telegram-login/config`),
 * narrowing with {@link getAuthChannelPolicyDetail} instead. The admin UI also reads the detail
 * view to show a warning next to the toggle.
 */
async function isChannelConfigured(channel: AuthChannel): Promise<boolean> {
  if (channel === 'email') return isSmtpConfigured();
  if (channel === 'sms') return isSmsProviderConfigured();
  if (channel === 'telegram') return isTelegramBotConfigured();
  return isMaxBotConfigured();
}

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
 * not {@link getAuthChannelPolicy}, when building what the patient/staff login screen shows.
 */
export async function getClientVisibleAuthChannelPolicy(): Promise<AuthChannelPolicy> {
  const detail = await getAuthChannelPolicyDetail();
  return {
    email: detail.email.enabled && detail.email.configured,
    sms: detail.sms.enabled && detail.sms.configured,
    telegram: detail.telegram.enabled && detail.telegram.configured,
    max: detail.max.enabled && detail.max.configured,
  };
}

/** Admin-only detail view: raw toggle state and configuration status, kept separate. */
export async function getAuthChannelPolicyDetail(): Promise<AuthChannelPolicyDetail> {
  const channels: readonly AuthChannel[] = ['email', 'sms', 'telegram', 'max'];
  const entries = await Promise.all(
    channels.map(async (channel) => {
      const [enabled, configured] = await Promise.all([
        getPublicRuntimeBool(SETTING_BY_CHANNEL[channel], 'public_auth_config'),
        isChannelConfigured(channel),
      ]);
      return [channel, { enabled, configured }] as const;
    }),
  );
  return Object.fromEntries(entries) as AuthChannelPolicyDetail;
}

/**
 * OAuth login providers. Each provider has an independent admin toggle, and the provider is
 * effective only when its complete credential set exists.
 * The independent admin toggle (`auth_oauth_*_enabled`) is decoupled from credential presence.
 * "Configured" is read straight from the same credential getters `oauth/start` already uses
 * (`integrationRuntime.ts`) — the pre-existing `oauth_google_enabled` / `oauth_yandex_enabled`
 * public projection (DB trigger, migrations 0193/0209/0210) is left untouched for compatibility
 * but is no longer the source of truth for this gate, so it never goes stale relative to it.
 */
export type OAuthProvider = 'google' | 'yandex' | 'apple';
export type OAuthProviderDetail = Readonly<{ enabled: boolean; configured: boolean }>;
export type OAuthProviderPolicyDetail = Readonly<Record<OAuthProvider, OAuthProviderDetail>>;

const OAUTH_TOGGLE_SETTING_BY_PROVIDER = {
  google: 'auth_oauth_google_enabled',
  yandex: 'auth_oauth_yandex_enabled',
  apple: 'auth_oauth_apple_enabled',
} as const;

async function isOAuthProviderConfigured(provider: OAuthProvider): Promise<boolean> {
  // Cross-check against the actual credential getters, not only the derived public projection —
  // the projection is refreshed by a DB trigger on credential writes, but reading the source
  // values directly here avoids any dependency on projection freshness for server-side gating.
  if (provider === 'google') {
    const [id, secret, redirect] = await Promise.all([
      getGoogleClientId(),
      getGoogleClientSecret(),
      getGoogleOauthLoginRedirectUri(),
    ]);
    return Boolean(id.trim() && secret.trim() && redirect.trim());
  }
  if (provider === 'apple') {
    const [id, redirect, team, keyId, privateKey] = await Promise.all([
      getAppleOauthClientId(),
      getAppleOauthRedirectUri(),
      getAppleOauthTeamId(),
      getAppleOauthKeyId(),
      getAppleOauthPrivateKey(),
    ]);
    return Boolean(
      id.trim() && redirect.trim() && team.trim() && keyId.trim() && privateKey.trim(),
    );
  }
  const [id, secret, redirect] = await Promise.all([
    getYandexOauthClientId(),
    getYandexOauthClientSecret(),
    getYandexOauthRedirectUri(),
  ]);
  return Boolean(id.trim() && secret.trim() && redirect.trim());
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
  const providers: readonly OAuthProvider[] = ['google', 'yandex', 'apple'];
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

export type IndependentAuthMethod = 'passkey' | 'pin';

const AUTH_METHOD_TOGGLE_SETTING = {
  passkey: 'auth_passkey_enabled',
  pin: 'auth_pin_enabled',
} as const;

/** Server-side gate for independent login methods; false is the safe default for both. */
export async function isIndependentAuthMethodEnabled(
  method: IndependentAuthMethod,
): Promise<boolean> {
  return getPublicRuntimeBool(AUTH_METHOD_TOGGLE_SETTING[method], 'public_auth_config');
}
