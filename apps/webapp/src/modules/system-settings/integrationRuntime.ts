import { env, integratorWebhookSecret, integratorWebappEntrySecret } from "@/config/env";

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

export async function getYandexOauthClientId(): Promise<string> {
  return env.YANDEX_OAUTH_CLIENT_ID?.trim() ?? "";
}

export async function getYandexOauthClientSecret(): Promise<string> {
  return env.YANDEX_OAUTH_CLIENT_SECRET?.trim() ?? "";
}

export async function getYandexOauthRedirectUri(): Promise<string> {
  return env.YANDEX_OAUTH_REDIRECT_URI?.trim() ?? "";
}
