import { env, integratorWebhookSecret, integratorWebappEntrySecret } from "@/config/env";
import { getConfigValue } from "@/modules/system-settings/configAdapter";

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
