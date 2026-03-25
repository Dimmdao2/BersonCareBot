/**
 * Чистые функции OAuth (Yandex). Зависимость fetch инжектируется для тестируемости.
 * Google/Apple — отложено до этапа 5.5.
 */

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
};

export type OAuthUserInfo = {
  id: string;
  email: string | null;
  name: string | null;
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

  let res: Response;
  try {
    res = await fetchFn("https://oauth.yandex.ru/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (err) {
    throw new Error(`yandex_token_network_error: ${String(err)}`);
  }

  if (!res.ok) {
    throw new Error(`yandex_token_exchange_failed: ${res.status}`);
  }

  const data = (await res.json()) as YandexTokenResponse;
  if (!data.access_token) throw new Error("yandex_no_access_token");
  return { accessToken: data.access_token };
}

/** Получает профиль пользователя Яндекса по access_token. */
export async function fetchYandexUserInfo(
  accessToken: string,
  fetchFn: typeof fetch = fetch,
): Promise<OAuthUserInfo> {
  let res: Response;
  try {
    res = await fetchFn("https://login.yandex.ru/info?format=json", {
      headers: { Authorization: `OAuth ${accessToken}` },
    });
  } catch (err) {
    throw new Error(`yandex_userinfo_network_error: ${String(err)}`);
  }

  if (!res.ok) {
    throw new Error(`yandex_userinfo_failed: ${res.status}`);
  }

  const data = (await res.json()) as YandexUserInfoResponse;
  return {
    id: data.id,
    email: data.default_email ?? null,
    name: data.real_name ?? data.login ?? null,
  };
}
