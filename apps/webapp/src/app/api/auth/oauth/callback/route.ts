import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { exchangeYandexCode, fetchYandexUserInfo } from "@/modules/auth/oauthService";
import { setSessionFromUser } from "@/modules/auth/service";
import { getRedirectPathForRole } from "@/modules/auth/redirectPolicy";
import { resolveRoleAsync } from "@/modules/auth/envRole";
import { resolveUserIdForYandexOAuth } from "@/modules/auth/oauthYandexResolve";
import { pgUserByPhonePort } from "@/infra/repos/pgUserByPhone";
import { pgOAuthBindingsPort } from "@/infra/repos/pgOAuthBindings";
import { inMemoryOAuthBindingsPort } from "@/infra/repos/inMemoryOAuthBindings";
import {
  getYandexOauthClientId,
  getYandexOauthClientSecret,
  getYandexOauthRedirectUri,
} from "@/modules/system-settings/integrationRuntime";

const OAUTH_STATE_COOKIE = "oauth_state_yandex";

/** Читает cookie из заголовка Request.headers без next/headers (тестируемо в unit). */
function readCookieFromRequest(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const chunk of cookieHeader.split(";")) {
    const eq = chunk.indexOf("=");
    if (eq === -1) continue;
    const k = chunk.slice(0, eq).trim();
    if (k === name) {
      return chunk.slice(eq + 1).trim() || null;
    }
  }
  return null;
}

function redirectToAppQuery(reason: string): URL {
  return new URL(`/app?oauth=error&reason=${encodeURIComponent(reason)}`, env.APP_BASE_URL);
}

/**
 * Callback OAuth (Yandex): CSRF (state) → code → token → userinfo → resolve user (OAuth / email merge / create)
 * → сессия → redirect. Публичная кнопка в login UI не используется — только прямой вызов `/api/auth/oauth/start`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const stateFromQuery = url.searchParams.get("state") ?? "";
  const stateFromCookie = readCookieFromRequest(request, OAUTH_STATE_COOKIE) ?? "";

  if (!stateFromQuery || !stateFromCookie || stateFromQuery !== stateFromCookie) {
    return NextResponse.json(
      { error: "oauth_csrf", message: "State mismatch или cookie отсутствует" },
      { status: 403 },
    );
  }

  const clientId = (await getYandexOauthClientId()).trim();
  const redirectUri = (await getYandexOauthRedirectUri()).trim();
  const secret = (await getYandexOauthClientSecret()).trim();

  if (!clientId || !redirectUri || !secret) {
    return NextResponse.redirect(new URL("/app?oauth=disabled&reason=not_configured", env.APP_BASE_URL));
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(redirectToAppQuery("no_code"));
  }

  let accessToken: string;
  try {
    const tokenResult = await exchangeYandexCode(code, {
      clientId,
      clientSecret: secret,
      redirectUri,
    });
    accessToken = tokenResult.accessToken;
  } catch {
    return NextResponse.redirect(redirectToAppQuery("exchange_failed"));
  }

  let yandexId: string;
  let oauthEmail: string | null;
  let oauthName: string | null;
  try {
    const info = await fetchYandexUserInfo(accessToken);
    yandexId = info.id;
    oauthEmail = info.email;
    oauthName = info.name;
  } catch {
    return NextResponse.redirect(redirectToAppQuery("userinfo_failed"));
  }

  const oauthPort = env.DATABASE_URL ? pgOAuthBindingsPort : inMemoryOAuthBindingsPort;

  const resolved = await resolveUserIdForYandexOAuth(oauthPort, {
    yandexId,
    email: oauthEmail,
    displayName: oauthName,
  });

  if (!resolved.ok) {
    const r = resolved.reason;
    if (r === "no_verified_email") {
      return NextResponse.redirect(redirectToAppQuery("no_verified_email"));
    }
    if (r === "email_ambiguous") {
      return NextResponse.redirect(redirectToAppQuery("email_ambiguous"));
    }
    return NextResponse.redirect(redirectToAppQuery("db_error"));
  }

  let sessionUser;
  try {
    sessionUser = await pgUserByPhonePort.findByUserId(resolved.userId);
  } catch {
    return NextResponse.redirect(redirectToAppQuery("db_error"));
  }

  if (!sessionUser) {
    return NextResponse.redirect(redirectToAppQuery("session_failed"));
  }

  const role = await resolveRoleAsync({
    phone: sessionUser.phone,
    telegramId: sessionUser.bindings.telegramId,
    maxId: sessionUser.bindings.maxId,
  });

  try {
    await setSessionFromUser({
      ...sessionUser,
      role,
      displayName: oauthName?.trim() || sessionUser.displayName || oauthEmail || yandexId,
    });
  } catch {
    return NextResponse.redirect(redirectToAppQuery("session_failed"));
  }

  return NextResponse.redirect(new URL(getRedirectPathForRole(role), env.APP_BASE_URL));
}
