import { env, integratorWebhookSecret, integratorWebappEntrySecret } from "@/config/env";
import { getConfigValue, getConfigBool } from "@/modules/system-settings/configAdapter";

/** MAX Platform API key (как `MAX_API_KEY` у интегратора) — проверка подписи `window.WebApp.initData` в Mini App. */
export async function getMaxBotApiKey(): Promise<string> {
  return getConfigValue("max_bot_api_key", "");
}

export async function getIntegratorApiUrl(): Promise<string> {
  return env.INTEGRATOR_API_URL ?? "";
}

export async function getIntegratorWebhookSecret(): Promise<string> {
  return integratorWebhookSecret();
}

export async function getIntegratorWebappEntrySecret(): Promise<string> {
  return integratorWebappEntrySecret();
}

export async function getTelegramBotToken(): Promise<string> {
  return env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
}

/** Yandex OAuth credentials: `system_settings` (admin), scope SSOT per project rules — не через env. */
export async function getYandexOauthClientId(): Promise<string> {
  return getConfigValue("yandex_oauth_client_id", "");
}

export async function getYandexOauthClientSecret(): Promise<string> {
  return getConfigValue("yandex_oauth_client_secret", "");
}

export async function getYandexOauthRedirectUri(): Promise<string> {
  return getConfigValue("yandex_oauth_redirect_uri", "");
}

/** Google Calendar OAuth / integration: `system_settings` (admin scope). */
export async function getGoogleClientId(): Promise<string> {
  return getConfigValue("google_client_id", "");
}

export async function getGoogleClientSecret(): Promise<string> {
  return getConfigValue("google_client_secret", "");
}

export async function getGoogleRedirectUri(): Promise<string> {
  return getConfigValue("google_redirect_uri", "");
}

export async function getGoogleRefreshToken(): Promise<string> {
  return getConfigValue("google_refresh_token", "");
}

export async function getGoogleCalendarId(): Promise<string> {
  return getConfigValue("google_calendar_id", "");
}

export async function getGoogleCalendarEnabled(): Promise<boolean> {
  return getConfigBool("google_calendar_enabled", false);
}

export async function getGoogleOauthLoginRedirectUri(): Promise<string> {
  return getConfigValue("google_oauth_login_redirect_uri", "");
}

export async function getAppleOauthClientId(): Promise<string> {
  return getConfigValue("apple_oauth_client_id", "");
}

export async function getAppleOauthTeamId(): Promise<string> {
  return getConfigValue("apple_oauth_team_id", "");
}

export async function getAppleOauthKeyId(): Promise<string> {
  return getConfigValue("apple_oauth_key_id", "");
}

export async function getAppleOauthPrivateKey(): Promise<string> {
  return getConfigValue("apple_oauth_private_key", "");
}

export async function getAppleOauthRedirectUri(): Promise<string> {
  return getConfigValue("apple_oauth_redirect_uri", "");
}
