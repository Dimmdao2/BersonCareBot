/**
 * Чистые функции OAuth (Yandex). Зависимость fetch инжектируется для тестируемости.
 * Google/Apple — отложено до этапа 5.5.
 */

import { fetchWithTimeout, OAUTH_PROVIDER_FETCH_TIMEOUT_MS } from "@/shared/lib/externalFetch";

export type YandexTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in?: number;
};

export type YandexUserInfoResponse = {
  id: string;
  login: string;
  real_name?: string;
  default_email?: string;
  default_phone?: { id: number; number: string };
};

export type OAuthUserInfo = {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
};

/** Обменивает authorization code на access_token через Yandex OAuth. */
export async function exchangeYandexCode(
  code: string,
  creds: { clientId: string; clientSecret: string; redirectUri: string },
  fetchFn: typeof fetch = fetch,
): Promise<{ accessToken: string }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    redirect_uri: creds.redirectUri,
  });

  let result:
    | { kind: "http_error"; status: number }
    | { kind: "parse_error"; error: unknown }
    | { kind: "success"; data: YandexTokenResponse };
  try {
    result = await fetchWithTimeout(
      "https://oauth.yandex.ru/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      },
      { timeoutMs: OAUTH_PROVIDER_FETCH_TIMEOUT_MS, fetchImpl: fetchFn },
      async (res) => {
        if (!res.ok) return { kind: "http_error", status: res.status } as const;
        try {
          return { kind: "success", data: (await res.json()) as YandexTokenResponse } as const;
        } catch (error: unknown) {
          return { kind: "parse_error", error } as const;
        }
      },
    );
  } catch (err) {
    throw new Error(`yandex_token_network_error: ${String(err)}`);
  }

  if (result.kind === "http_error") {
    throw new Error(`yandex_token_exchange_failed: ${result.status}`);
  }
  if (result.kind === "parse_error") throw result.error;

  const data = result.data;
  if (!data.access_token) throw new Error("yandex_no_access_token");
  return { accessToken: data.access_token };
}

/** Получает профиль пользователя Яндекса по access_token. */
export async function fetchYandexUserInfo(
  accessToken: string,
  fetchFn: typeof fetch = fetch,
): Promise<OAuthUserInfo> {
  let result:
    | { kind: "http_error"; status: number }
    | { kind: "parse_error"; error: unknown }
    | { kind: "success"; data: YandexUserInfoResponse };
  try {
    result = await fetchWithTimeout(
      "https://login.yandex.ru/info?format=json",
      { headers: { Authorization: `OAuth ${accessToken}` } },
      { timeoutMs: OAUTH_PROVIDER_FETCH_TIMEOUT_MS, fetchImpl: fetchFn },
      async (res) => {
        if (!res.ok) return { kind: "http_error", status: res.status } as const;
        try {
          return { kind: "success", data: (await res.json()) as YandexUserInfoResponse } as const;
        } catch (error: unknown) {
          return { kind: "parse_error", error } as const;
        }
      },
    );
  } catch (err) {
    throw new Error(`yandex_userinfo_network_error: ${String(err)}`);
  }

  if (result.kind === "http_error") {
    throw new Error(`yandex_userinfo_failed: ${result.status}`);
  }
  if (result.kind === "parse_error") throw result.error;

  const data = result.data;
  return {
    id: data.id,
    email: data.default_email ?? null,
    name: data.real_name ?? data.login ?? null,
    phone: data.default_phone?.number ?? null,
  };
}
