import { env } from "@/config/env";
import { getConfigValue } from "./configAdapter";

export async function getIntegratorApiUrl(): Promise<string> {
  return getConfigValue("integrator_api_url", env.INTEGRATOR_API_URL ?? "");
}

export async function getIntegratorWebhookSecret(): Promise<string> {
  const envFallback = env.INTEGRATOR_WEBHOOK_SECRET?.trim() || env.INTEGRATOR_SHARED_SECRET?.trim() || "";
  return getConfigValue("integrator_webhook_secret", envFallback);
}

export async function getIntegratorWebappEntrySecret(): Promise<string> {
  const envFallback = env.INTEGRATOR_WEBAPP_ENTRY_SECRET?.trim() || env.INTEGRATOR_SHARED_SECRET?.trim() || "";
  return getConfigValue("integrator_webapp_entry_secret", envFallback);
}

export async function getTelegramBotToken(): Promise<string> {
  return getConfigValue("telegram_bot_token", env.TELEGRAM_BOT_TOKEN?.trim() || "");
}

export async function getYandexOauthClientId(): Promise<string> {
  return getConfigValue("yandex_oauth_client_id", env.YANDEX_OAUTH_CLIENT_ID?.trim() || "");
}

export async function getYandexOauthClientSecret(): Promise<string> {
  return getConfigValue("yandex_oauth_client_secret", env.YANDEX_OAUTH_CLIENT_SECRET?.trim() || "");
}

export async function getYandexOauthRedirectUri(): Promise<string> {
  return getConfigValue("yandex_oauth_redirect_uri", env.YANDEX_OAUTH_REDIRECT_URI?.trim() || "");
}
