import { NextResponse } from "next/server";
import { env, webappReposAreInMemory } from "@/config/env";
import { parseVerifiedSignedOAuthState } from "@/modules/auth/oauthSignedState";
import {
  getAppleOauthClientId,
  getAppleOauthRedirectUri,
  getAppleOauthTeamId,
  getAppleOauthKeyId,
  getAppleOauthPrivateKey,
} from "@/modules/system-settings/integrationRuntime";
import {
  buildAppleClientSecretJwt,
  exchangeAppleAuthorizationCode,
  parseAppleUserNameJson,
  verifyAppleIdToken,
} from "@/modules/auth/appleOAuthHelpers";
import { resolveUserIdForWebOAuthLogin } from "@/modules/auth/oauthWebLoginResolve";
import { pgOAuthBindingsPort } from "@/infra/repos/pgOAuthBindings";
import { inMemoryOAuthBindingsPort } from "@/infra/repos/inMemoryOAuthBindings";
import {
  completeOAuthWebLoginRedirectUrls,
  oauthWebLoginErrorRedirect,
} from "@/modules/auth/oauthWebSession";

/**
 * POST /api/auth/oauth/callback/apple — Sign in with Apple (`response_mode=form_post`).
 */
export async function POST(request: Request) {
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes("application/x-www-form-urlencoded")) {
    return NextResponse.redirect(
      new URL(oauthWebLoginErrorRedirect("invalid_content_type"), env.APP_BASE_URL),
    );
  }

  let params: URLSearchParams;
  try {
    const text = await request.text();
    params = new URLSearchParams(text);
  } catch {
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect("invalid_body"), env.APP_BASE_URL));
  }

  const stateRaw = params.get("state") ?? "";
  const verified = parseVerifiedSignedOAuthState(stateRaw, "apple");
  if (!verified || !verified.nonce) {
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect("invalid_state"), env.APP_BASE_URL));
  }

  const errorParam = params.get("error");
  if (errorParam) {
    return NextResponse.redirect(
      new URL(oauthWebLoginErrorRedirect(errorParam.slice(0, 80)), env.APP_BASE_URL),
    );
  }

  const code = params.get("code");
  if (!code) {
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect("no_code"), env.APP_BASE_URL));
  }

  const clientId = (await getAppleOauthClientId()).trim();
  const redirectUri = (await getAppleOauthRedirectUri()).trim();
  const teamId = (await getAppleOauthTeamId()).trim();
  const keyId = (await getAppleOauthKeyId()).trim();
  const privateKey = (await getAppleOauthPrivateKey()).trim();

  if (!clientId || !redirectUri || !teamId || !keyId || !privateKey) {
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect("not_configured"), env.APP_BASE_URL));
  }

  let clientSecretJwt: string;
  try {
    clientSecretJwt = await buildAppleClientSecretJwt({
      teamId,
      clientId,
      keyId,
      privateKeyPem: privateKey,
    });
  } catch {
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect("apple_jwt_failed"), env.APP_BASE_URL));
  }

  let idToken: string | undefined;
  try {
    const tokens = await exchangeAppleAuthorizationCode({
      clientId,
      clientSecretJwt,
      code,
      redirectUri,
    });
    idToken = tokens.id_token;
  } catch {
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect("exchange_failed"), env.APP_BASE_URL));
  }

  if (!idToken) {
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect("no_id_token"), env.APP_BASE_URL));
  }

  let claims: { sub: string; email?: string };
  try {
    claims = await verifyAppleIdToken({
      idToken,
      clientId,
      expectedNonce: verified.nonce,
    });
  } catch {
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect("id_token_invalid"), env.APP_BASE_URL));
  }

  const userFromForm = parseAppleUserNameJson(params.get("user"));
  const email = claims.email?.trim() || null;
  const displayName = userFromForm;
  const emailVerified = Boolean(email);

  const oauthPort = webappReposAreInMemory() ? inMemoryOAuthBindingsPort : pgOAuthBindingsPort;

  const resolved = await resolveUserIdForWebOAuthLogin(oauthPort, {
    provider: "apple",
    providerUserId: claims.sub,
    email,
    emailVerified,
    displayName,
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
    displayNameHint: displayName?.trim() || email || claims.sub,
  });

  if (!done.ok) {
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect(done.reason), env.APP_BASE_URL));
  }

  return NextResponse.redirect(done.redirectUrl);
}
