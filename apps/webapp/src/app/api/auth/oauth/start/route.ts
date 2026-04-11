import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createAppleSignedOAuthState,
  createSignedOAuthState,
} from "@/modules/auth/oauthSignedState";
import {
  getYandexOauthClientId,
  getYandexOauthClientSecret,
  getYandexOauthRedirectUri,
  getGoogleClientId,
  getGoogleClientSecret,
  getGoogleOauthLoginRedirectUri,
  getAppleOauthClientId,
  getAppleOauthRedirectUri,
  getAppleOauthTeamId,
  getAppleOauthKeyId,
  getAppleOauthPrivateKey,
} from "@/modules/system-settings/integrationRuntime";
import {
  isOAuthStartRateLimitedByKey,
  resolveOAuthStartRateLimitClientKey,
} from "@/modules/auth/oauthStartRateLimit";

const OAUTH_STATE_TTL_SECONDS = 600; // 10 минут

const bodySchema = z.object({
  provider: z.enum(["yandex", "google", "apple"]),
});

const GOOGLE_LOGIN_SCOPES = ["openid", "email", "profile"].join(" ");

/**
 * Старт OAuth: Яндекс / Google / Apple при наличии ключей в `system_settings` (admin).
 * Подписанный `state` (без cookie); для Apple дополнительно `nonce` в authorize URL.
 */
export async function POST(request: Request) {
  const identity = resolveOAuthStartRateLimitClientKey(request);
  if (!identity.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "proxy_configuration",
        message: "Запрос должен проходить через reverse proxy с заголовком X-Real-IP.",
      },
      { status: 503 },
    );
  }
  if (await isOAuthStartRateLimitedByKey(identity.key)) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", message: "Слишком много попыток. Попробуйте позже." },
      { status: 429 },
    );
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", message: "Укажите провайдера" },
      { status: 400 },
    );
  }

  const { provider } = parsed.data;

  if (provider === "yandex") {
    const clientId = (await getYandexOauthClientId()).trim();
    const redirectUri = (await getYandexOauthRedirectUri()).trim();
    const secret = (await getYandexOauthClientSecret()).trim();
    if (!clientId || !redirectUri || !secret) {
      return NextResponse.json(
        { ok: false, error: "oauth_disabled", message: "OAuth не настроен" },
        { status: 501 },
      );
    }
    const state = createSignedOAuthState("yandex", OAUTH_STATE_TTL_SECONDS);
    const authUrl = new URL("https://oauth.yandex.ru/authorize");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", "login:info login:email login:default_phone");
    authUrl.searchParams.set("state", state);
    return NextResponse.json({ ok: true, authUrl: authUrl.toString() });
  }

  if (provider === "google") {
    const clientId = (await getGoogleClientId()).trim();
    const clientSecret = (await getGoogleClientSecret()).trim();
    const redirectUri = (await getGoogleOauthLoginRedirectUri()).trim();
    if (!clientId || !clientSecret || !redirectUri) {
      return NextResponse.json(
        { ok: false, error: "oauth_disabled", message: "Google OAuth для входа не настроен" },
        { status: 501 },
      );
    }
    const state = createSignedOAuthState("google_login", OAUTH_STATE_TTL_SECONDS);
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", GOOGLE_LOGIN_SCOPES);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("access_type", "online");
    authUrl.searchParams.set("include_granted_scopes", "true");
    return NextResponse.json({ ok: true, authUrl: authUrl.toString() });
  }

  const appleClientId = (await getAppleOauthClientId()).trim();
  const appleRedirect = (await getAppleOauthRedirectUri()).trim();
  const appleTeam = (await getAppleOauthTeamId()).trim();
  const appleKeyId = (await getAppleOauthKeyId()).trim();
  const applePem = (await getAppleOauthPrivateKey()).trim();
  if (!appleClientId || !appleRedirect || !appleTeam || !appleKeyId || !applePem) {
    return NextResponse.json(
      { ok: false, error: "oauth_disabled", message: "Sign in with Apple не настроен" },
      { status: 501 },
    );
  }
  const { state, nonce } = createAppleSignedOAuthState(OAUTH_STATE_TTL_SECONDS);
  const authUrl = new URL("https://appleid.apple.com/auth/authorize");
  authUrl.searchParams.set("client_id", appleClientId);
  authUrl.searchParams.set("redirect_uri", appleRedirect);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("response_mode", "form_post");
  authUrl.searchParams.set("scope", "name email");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("nonce", nonce);
  return NextResponse.json({ ok: true, authUrl: authUrl.toString() });
}
