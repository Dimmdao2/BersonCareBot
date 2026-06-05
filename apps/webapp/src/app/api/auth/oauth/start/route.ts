import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureAuthModulePortsBound } from "@/app-layer/di/bindAuthModulePorts";
import type { AuthRegistrationAuthMethod } from "@/app-layer/product-analytics/recordAuthRegistration";
import {
  newRegistrationAttemptId,
  recordAuthRegistrationAttempt,
  recordAuthRegistrationFailure,
  registrationAttemptIdFromOAuthState,
} from "@/app-layer/product-analytics/recordAuthRegistration";
import {
  createAppleSignedOAuthState,
  createSignedOAuthState,
  parseVerifiedSignedOAuthState,
  type OAuthStatePurpose,
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

const OAUTH_STATE_TTL_SECONDS = 600;

const bodySchema = z.object({
  provider: z.enum(["yandex", "google", "apple"]),
  browserCalendarIana: z.string().max(120).optional(),
});

const GOOGLE_LOGIN_SCOPES = ["openid", "email", "profile"].join(" ");

function oauthAuthMethod(provider: z.infer<typeof bodySchema>["provider"]): AuthRegistrationAuthMethod {
  if (provider === "google") return "oauth_google";
  if (provider === "apple") return "oauth_apple";
  return "oauth_yandex";
}

function oauthStatePurpose(provider: z.infer<typeof bodySchema>["provider"]): OAuthStatePurpose {
  if (provider === "google") return "google_login";
  if (provider === "apple") return "apple";
  return "yandex";
}

async function logOAuthStartAttempt(provider: z.infer<typeof bodySchema>["provider"], state: string) {
  const attemptId = registrationAttemptIdFromOAuthState(
    parseVerifiedSignedOAuthState(state, oauthStatePurpose(provider)),
  );
  await recordAuthRegistrationAttempt({
    attemptId,
    authMethod: oauthAuthMethod(provider),
    stage: "start",
    entryChannel: "browser",
    contactType: "oauth_provider",
    contactValue: provider,
  });
}

async function logOAuthStartFailure(
  provider: z.infer<typeof bodySchema>["provider"] | null,
  errorCode: string,
) {
  await recordAuthRegistrationFailure({
    attemptId: newRegistrationAttemptId(),
    authMethod: provider ? oauthAuthMethod(provider) : "oauth_yandex",
    stage: "start",
    entryChannel: "browser",
    contactType: "oauth_provider",
    contactValue: provider ?? "unknown",
    errorCode,
  });
}

/**
 * Старт OAuth: Яндекс / Google / Apple при наличии ключей в `system_settings` (admin).
 */
export async function POST(request: Request) {
  ensureAuthModulePortsBound();

  const identity = resolveOAuthStartRateLimitClientKey(request);
  if (!identity.ok) {
    await logOAuthStartFailure(null, "proxy_configuration");
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
    await logOAuthStartFailure(null, "rate_limited");
    return NextResponse.json(
      { ok: false, error: "rate_limited", message: "Слишком много попыток. Попробуйте позже." },
      { status: 429 },
    );
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    await logOAuthStartFailure(null, "invalid_body");
    return NextResponse.json(
      { ok: false, error: "invalid_body", message: "Укажите провайдера" },
      { status: 400 },
    );
  }

  const { provider, browserCalendarIana } = parsed.data;
  const tzOpt = { browserCalendarIana: browserCalendarIana?.trim() || null };

  if (provider === "yandex") {
    const clientId = (await getYandexOauthClientId()).trim();
    const redirectUri = (await getYandexOauthRedirectUri()).trim();
    const secret = (await getYandexOauthClientSecret()).trim();
    if (!clientId || !redirectUri || !secret) {
      await logOAuthStartFailure(provider, "oauth_disabled");
      return NextResponse.json(
        { ok: false, error: "oauth_disabled", message: "OAuth не настроен" },
        { status: 501 },
      );
    }
    const state = createSignedOAuthState("yandex", OAUTH_STATE_TTL_SECONDS, tzOpt);
    await logOAuthStartAttempt(provider, state);
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
      await logOAuthStartFailure(provider, "oauth_disabled");
      return NextResponse.json(
        { ok: false, error: "oauth_disabled", message: "Google OAuth для входа не настроен" },
        { status: 501 },
      );
    }
    const state = createSignedOAuthState("google_login", OAUTH_STATE_TTL_SECONDS, tzOpt);
    await logOAuthStartAttempt(provider, state);
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
    await logOAuthStartFailure(provider, "oauth_disabled");
    return NextResponse.json(
      { ok: false, error: "oauth_disabled", message: "Sign in with Apple не настроен" },
      { status: 501 },
    );
  }
  const { state, nonce } = createAppleSignedOAuthState(OAUTH_STATE_TTL_SECONDS, tzOpt);
  await logOAuthStartAttempt(provider, state);
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
