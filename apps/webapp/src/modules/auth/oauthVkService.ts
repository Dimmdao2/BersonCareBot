/**
 * Чистые функции OAuth (VK ID, OAuth 2.1 + PKCE). Зависимость fetch инжектируется для тестируемости.
 *
 * ⚠️ Endpoint/field shapes below are the best-effort VK ID (id.vk.com) OAuth 2.1 contract as
 * documented publicly; there is no live application yet (owner supplies `vk_id_*` credentials
 * separately — see VK_ID_LOGIN_BRIEF_2026-08-03.md). The lead must confirm these against the live
 * VK ID application dashboard once real credentials land, the same way the other providers'
 * `oauthService.ts` functions were validated against a live app.
 */

import { fetchWithTimeout, OAUTH_PROVIDER_FETCH_TIMEOUT_MS } from '@/shared/lib/externalFetch';

export type VkTokenResponse = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
  user_id?: number | string;
  scope?: string;
};

export type VkUserInfoResponse = {
  user: {
    user_id: number | string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    email?: string;
  };
};

export type OAuthUserInfo = {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
};

/** Обменивает authorization code (+ PKCE code_verifier) на access_token через VK ID OAuth 2.1. */
export async function exchangeVkCode(
  code: string,
  creds: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    deviceId: string;
    codeVerifier: string;
    state: string;
  },
  fetchFn: typeof fetch = fetch,
): Promise<{ accessToken: string; vkUserId: string | null }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    redirect_uri: creds.redirectUri,
    device_id: creds.deviceId,
    code_verifier: creds.codeVerifier,
    state: creds.state,
  });

  let result:
    | { kind: 'http_error'; status: number }
    | { kind: 'parse_error'; error: unknown }
    | { kind: 'success'; data: VkTokenResponse };
  try {
    result = await fetchWithTimeout(
      'https://id.vk.com/oauth2/auth',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      },
      { timeoutMs: OAUTH_PROVIDER_FETCH_TIMEOUT_MS, fetchImpl: fetchFn },
      async (res) => {
        if (!res.ok) return { kind: 'http_error', status: res.status } as const;
        try {
          return { kind: 'success', data: (await res.json()) as VkTokenResponse } as const;
        } catch (error: unknown) {
          return { kind: 'parse_error', error } as const;
        }
      },
    );
  } catch (err) {
    throw new Error(`vk_token_network_error: ${String(err)}`);
  }

  if (result.kind === 'http_error') {
    throw new Error(`vk_token_exchange_failed: ${result.status}`);
  }
  if (result.kind === 'parse_error') throw result.error;

  const data = result.data;
  if (!data.access_token) throw new Error('vk_no_access_token');
  return { accessToken: data.access_token, vkUserId: data.user_id != null ? String(data.user_id) : null };
}

/** Получает профиль пользователя VK ID по access_token. */
export async function fetchVkUserInfo(
  accessToken: string,
  clientId: string,
  fetchFn: typeof fetch = fetch,
): Promise<OAuthUserInfo> {
  let result:
    | { kind: 'http_error'; status: number }
    | { kind: 'parse_error'; error: unknown }
    | { kind: 'success'; data: VkUserInfoResponse };
  try {
    result = await fetchWithTimeout(
      'https://id.vk.com/oauth2/user_info',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId, access_token: accessToken }).toString(),
      },
      { timeoutMs: OAUTH_PROVIDER_FETCH_TIMEOUT_MS, fetchImpl: fetchFn },
      async (res) => {
        if (!res.ok) return { kind: 'http_error', status: res.status } as const;
        try {
          return { kind: 'success', data: (await res.json()) as VkUserInfoResponse } as const;
        } catch (error: unknown) {
          return { kind: 'parse_error', error } as const;
        }
      },
    );
  } catch (err) {
    throw new Error(`vk_userinfo_network_error: ${String(err)}`);
  }

  if (result.kind === 'http_error') {
    throw new Error(`vk_userinfo_failed: ${result.status}`);
  }
  if (result.kind === 'parse_error') throw result.error;

  const user = result.data.user;
  if (!user?.user_id) throw new Error('vk_userinfo_missing_user_id');
  const name = [user.first_name, user.last_name].filter((part) => part?.trim()).join(' ').trim();
  return {
    id: String(user.user_id),
    email: user.email ?? null,
    name: name || null,
    phone: user.phone ?? null,
  };
}
