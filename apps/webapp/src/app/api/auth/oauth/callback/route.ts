import { NextResponse } from "next/server";
import { env, webappReposAreInMemory } from "@/config/env";
import { exchangeYandexCode, fetchYandexUserInfo } from "@/modules/auth/oauthService";
import { setSessionFromUser } from "@/modules/auth/service";
import { getRedirectPathForRole } from "@/modules/auth/redirectPolicy";
import { resolveRoleAsync } from "@/modules/auth/envRole";
import { resolveUserIdForYandexOAuth } from "@/modules/auth/oauthYandexResolve";
import { pgUserByPhonePort } from "@/infra/repos/pgUserByPhone";
import { pgOAuthBindingsPort } from "@/infra/repos/pgOAuthBindings";
import { inMemoryOAuthBindingsPort } from "@/infra/repos/inMemoryOAuthBindings";
import { routePaths } from "@/app-layer/routes/paths";
import {
  getYandexOauthClientId,
  getYandexOauthClientSecret,
  getYandexOauthRedirectUri,
} from "@/modules/system-settings/integrationRuntime";
import { verifySignedOAuthState } from "@/modules/auth/oauthSignedState";

function redirectToAppQuery(reason: string): URL {
  return new URL(`/app?oauth=error&reason=${encodeURIComponent(reason)}`, env.APP_BASE_URL);
}

/**
 * Callback OAuth (Yandex): подписанный state → code → token → userinfo → resolve user (OAuth / email merge / create)
 * → сессия → redirect. Публичная кнопка в login UI не используется — только прямой вызов `/api/auth/oauth/start`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const stateFromQuery = url.searchParams.get("state") ?? "";

  if (!stateFromQuery || !verifySignedOAuthState(stateFromQuery, "yandex")) {
    return NextResponse.json(
      { error: "oauth_csrf", message: "Недействительный или просроченный state" },
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
  let oauthPhone: string | null;
  try {
    const info = await fetchYandexUserInfo(accessToken);
    yandexId = info.id;
    oauthEmail = info.email;
    oauthName = info.name;
    oauthPhone = info.phone;
  } catch {
    return NextResponse.redirect(redirectToAppQuery("userinfo_failed"));
  }

  const oauthPort = webappReposAreInMemory() ? inMemoryOAuthBindingsPort : pgOAuthBindingsPort;

  const resolved = await resolveUserIdForYandexOAuth(oauthPort, {
    yandexId,
    email: oauthEmail,
    displayName: oauthName,
    phone: oauthPhone,
  });

  if (!resolved.ok) {
    const r = resolved.reason;
    if (r === "no_identity") {
      return NextResponse.redirect(redirectToAppQuery("no_identity"));
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

  const finalRedirect = getRedirectPathForRole(role);

  // Яндекс не вернул телефон → направить на привязку номера через SMS OTP
  if (!sessionUser.phone) {
    const bindPhoneUrl = new URL(routePaths.bindPhone, env.APP_BASE_URL);
    bindPhoneUrl.searchParams.set("next", finalRedirect);
    bindPhoneUrl.searchParams.set("reason", "oauth_phone_required");
    return NextResponse.redirect(bindPhoneUrl);
  }

  return NextResponse.redirect(new URL(finalRedirect, env.APP_BASE_URL));
}
