import { NextResponse } from "next/server";
import { env, webappReposAreInMemory } from "@/config/env";
import { verifySignedOAuthState } from "@/modules/auth/oauthSignedState";
import {
  getGoogleClientId,
  getGoogleClientSecret,
  getGoogleOauthLoginRedirectUri,
} from "@/modules/system-settings/integrationRuntime";
import { exchangeGoogleCode, fetchGoogleUserProfile } from "@/modules/google-calendar/googleOAuthHelpers";
import { resolveUserIdForWebOAuthLogin } from "@/modules/auth/oauthWebLoginResolve";
import { pgOAuthBindingsPort } from "@/infra/repos/pgOAuthBindings";
import { inMemoryOAuthBindingsPort } from "@/infra/repos/inMemoryOAuthBindings";
import {
  completeOAuthWebLoginRedirectUrls,
  oauthWebLoginErrorRedirect,
} from "@/modules/auth/oauthWebSession";

/**
 * GET /api/auth/oauth/callback/google — веб-логин Google (не календарь). Refresh token не сохраняем.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const stateFromQuery = url.searchParams.get("state") ?? "";

  if (!stateFromQuery || !verifySignedOAuthState(stateFromQuery, "google_login")) {
    return NextResponse.json(
      { error: "oauth_csrf", message: "Недействительный или просроченный state" },
      { status: 403 },
    );
  }

  const clientId = (await getGoogleClientId()).trim();
  const clientSecret = (await getGoogleClientSecret()).trim();
  const redirectUri = (await getGoogleOauthLoginRedirectUri()).trim();

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect("not_configured"), env.APP_BASE_URL));
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect("no_code"), env.APP_BASE_URL));
  }

  let accessToken: string;
  try {
    const tokens = await exchangeGoogleCode(code, { clientId, clientSecret, redirectUri });
    accessToken = tokens.accessToken;
    void tokens.refreshToken;
  } catch {
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect("exchange_failed"), env.APP_BASE_URL));
  }

  const profile = await fetchGoogleUserProfile(accessToken);
  if (!profile) {
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect("userinfo_failed"), env.APP_BASE_URL));
  }

  const oauthPort = webappReposAreInMemory() ? inMemoryOAuthBindingsPort : pgOAuthBindingsPort;

  const resolved = await resolveUserIdForWebOAuthLogin(oauthPort, {
    provider: "google",
    providerUserId: profile.sub,
    email: profile.email,
    emailVerified: profile.emailVerified,
    displayName: profile.name,
    phone: null,
  });

  if (!resolved.ok) {
    const r = resolved.reason;
    if (r === "no_identity") {
      return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect("no_identity"), env.APP_BASE_URL));
    }
    if (r === "email_ambiguous") {
      return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect("email_ambiguous"), env.APP_BASE_URL));
    }
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect("db_error"), env.APP_BASE_URL));
  }

  const done = await completeOAuthWebLoginRedirectUrls({
    userId: resolved.userId,
    displayNameHint: profile.name?.trim() || profile.email || profile.sub,
  });

  if (!done.ok) {
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect(done.reason), env.APP_BASE_URL));
  }

  return NextResponse.redirect(done.redirectUrl);
}
