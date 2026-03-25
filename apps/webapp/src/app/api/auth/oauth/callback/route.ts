import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { exchangeYandexCode, fetchYandexUserInfo } from "@/modules/auth/oauthService";
import { setSessionFromUser } from "@/modules/auth/service";
import { getRedirectPathForRole } from "@/modules/auth/redirectPolicy";
import { resolveRoleFromEnv } from "@/modules/auth/envRole";
import { pgOAuthBindingsPort } from "@/infra/repos/pgOAuthBindings";
import { inMemoryOAuthBindingsPort } from "@/infra/repos/inMemoryOAuthBindings";

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

/**
 * Callback OAuth (Yandex). Реализует:
 * 1. CSRF-проверку через `state` — несовпадение → 403.
 * 2. Обмен `code` на access_token через Yandex OAuth.
 * 3. Получение профиля пользователя (Yandex Login API).
 * 4. Поиск пользователя в user_oauth_bindings.
 * 5. Создание сессии + redirect по роли.
 *
 * Google/Apple — отложено до этапа 5.5.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const stateFromQuery = url.searchParams.get("state") ?? "";
  const stateFromCookie = readCookieFromRequest(request, OAUTH_STATE_COOKIE) ?? "";

  // 1. CSRF-защита: state должен совпадать с cookie
  if (!stateFromQuery || !stateFromCookie || stateFromQuery !== stateFromCookie) {
    return NextResponse.json(
      { error: "oauth_csrf", message: "State mismatch или cookie отсутствует" },
      { status: 403 }
    );
  }

  const clientId = env.YANDEX_OAUTH_CLIENT_ID?.trim();
  const redirectUri = env.YANDEX_OAUTH_REDIRECT_URI?.trim();
  const secret = env.YANDEX_OAUTH_CLIENT_SECRET?.trim();

  if (!clientId || !redirectUri || !secret) {
    return NextResponse.redirect(
      new URL("/app?oauth=disabled&reason=not_configured", env.APP_BASE_URL)
    );
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/app?oauth=error&reason=no_code", env.APP_BASE_URL));
  }

  // 2. Обмен code → access_token
  let accessToken: string;
  try {
    const tokenResult = await exchangeYandexCode(code, {
      clientId,
      clientSecret: secret,
      redirectUri,
    });
    accessToken = tokenResult.accessToken;
  } catch {
    return NextResponse.redirect(
      new URL("/app?oauth=error&reason=exchange_failed", env.APP_BASE_URL)
    );
  }

  // 3. Получить профиль пользователя
  let yandexId: string;
  let oauthEmail: string | null;
  let oauthName: string | null;
  try {
    const info = await fetchYandexUserInfo(accessToken);
    yandexId = info.id;
    oauthEmail = info.email;
    oauthName = info.name;
  } catch {
    return NextResponse.redirect(
      new URL("/app?oauth=error&reason=userinfo_failed", env.APP_BASE_URL)
    );
  }

  // 4. Найти пользователя по OAuth-привязке
  const oauthPort = env.DATABASE_URL ? pgOAuthBindingsPort : inMemoryOAuthBindingsPort;
  let existingUser: { userId: string } | null;
  try {
    existingUser = await oauthPort.findUserByOAuthId("yandex", yandexId);
  } catch {
    return NextResponse.redirect(
      new URL("/app?oauth=error&reason=db_error", env.APP_BASE_URL)
    );
  }

  if (!existingUser) {
    return NextResponse.redirect(
      new URL("/app?oauth=error&reason=user_not_linked", env.APP_BASE_URL)
    );
  }

  // 5. Создать сессию и редиректить по роли
  const role = resolveRoleFromEnv({});
  try {
    await setSessionFromUser({
      userId: existingUser.userId,
      role,
      displayName: oauthName ?? oauthEmail ?? yandexId,
      bindings: {},
    });
  } catch {
    return NextResponse.redirect(
      new URL("/app?oauth=error&reason=session_failed", env.APP_BASE_URL)
    );
  }

  return NextResponse.redirect(new URL(getRedirectPathForRole(role), env.APP_BASE_URL));
}
