import { env, integratorWebhookSecret, integratorWebappEntrySecret } from '@/config/env';
import {
  getConfigValue,
  getExactOrganizationConfigValue,
} from '@/modules/system-settings/configAdapter';
import { RuntimeSettingUnavailableError } from '@/modules/system-settings/runtimeSettingUnavailable';

/** MAX Platform API key (как `MAX_API_KEY` у интегратора) — проверка подписи `window.WebApp.initData` в Mini App. */
export async function getMaxBotApiKey(): Promise<string> {
  return getConfigValue('max_bot_api_key');
}

export async function getIntegratorApiUrl(): Promise<string> {
  return env.INTEGRATOR_API_URL ?? '';
}

export async function getIntegratorWebhookSecret(): Promise<string> {
  return integratorWebhookSecret();
}

export async function getIntegratorWebappEntrySecret(): Promise<string> {
  return integratorWebappEntrySecret();
}

export async function getTelegramBotToken(): Promise<string> {
  return getConfigValue('telegram_bot_token');
}

/** Yandex OAuth credentials: `system_settings` (admin), scope SSOT per project rules — не через env. */
export async function getYandexOauthClientId(): Promise<string> {
  return getConfigValue('yandex_oauth_client_id');
}

export async function getYandexOauthClientSecret(): Promise<string> {
  return getConfigValue('yandex_oauth_client_secret');
}

export async function getYandexOauthRedirectUri(): Promise<string> {
  return getConfigValue('yandex_oauth_redirect_uri');
}

/** Google Calendar OAuth / integration: `system_settings` (admin scope). */
export async function getGoogleClientId(): Promise<string> {
  return getConfigValue('google_client_id');
}

export async function getGoogleClientSecret(): Promise<string> {
  return getConfigValue('google_client_secret');
}

export async function getGoogleRedirectUri(): Promise<string> {
  return getConfigValue('google_redirect_uri');
}

export async function getGoogleRefreshToken(organizationId: string): Promise<string> {
  return getExactOrganizationConfigValue('google_refresh_token', organizationId);
}

/** Global platform kill-switch; malformed or unavailable state is fail-closed for Calendar. */
export async function isGoogleCalendarPlatformAvailable(): Promise<boolean> {
  const raw = await getConfigValue('platform_integration_availability');
  try {
    const value = JSON.parse(raw) as {
      version?: unknown;
      integrations?: { google_calendar?: unknown };
    };
    return value.version === 1 && value.integrations?.google_calendar === true;
  } catch {
    throw new RuntimeSettingUnavailableError('platform_integration_availability');
  }
}

export async function getGoogleOauthLoginRedirectUri(): Promise<string> {
  return getConfigValue('google_oauth_login_redirect_uri');
}

export async function getAppleOauthClientId(): Promise<string> {
  return getConfigValue('apple_oauth_client_id');
}

export async function getAppleOauthTeamId(): Promise<string> {
  return getConfigValue('apple_oauth_team_id');
}

export async function getAppleOauthKeyId(): Promise<string> {
  return getConfigValue('apple_oauth_key_id');
}

export async function getAppleOauthPrivateKey(): Promise<string> {
  return getConfigValue('apple_oauth_private_key');
}

export async function getAppleOauthRedirectUri(): Promise<string> {
  return getConfigValue('apple_oauth_redirect_uri');
}
