import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { parseVerifiedSignedOAuthState } from "@/modules/auth/oauthSignedState";
import {
  getAppleOauthClientId,
  getAppleOauthRedirectUri,
  getAppleOauthTeamId,
  getAppleOauthKeyId,
  getAppleOauthPrivateKey,
  getAppBaseUrl,
} from "@/modules/system-settings/integrationRuntime";
import {
  buildAppleClientSecretJwt,
  exchangeAppleAuthorizationCode,
  parseAppleUserNameJson,
  verifyAppleIdToken,
} from "@/modules/auth/appleOAuthHelpers";
import { resolveUserIdForWebOAuthLogin } from "@/modules/auth/oauthWebLoginResolve";
import {
  completeOAuthWebLoginRedirectUrls,
  oauthWebLoginErrorRedirect,
} from "@/modules/auth/oauthWebSession";

/**
 * POST /api/auth/oauth/callback/apple — Sign in with Apple (`response_mode=form_post`).
 */
export async function POST(request: Request) {
  const appBase = await getAppBaseUrl();
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes("application/x-www-form-urlencoded")) {
    return NextResponse.redirect(
      new URL(oauthWebLoginErrorRedirect("invalid_content_type"), appBase),
    );
  }

  let params: URLSearchParams;
  try {
    const text = await request.text();
    params = new URLSearchParams(text);
  } catch {
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect("invalid_body"), appBase));
  }

  const stateRaw = params.get("state") ?? "";
  const verified = parseVerifiedSignedOAuthState(stateRaw, "apple");
  if (!verified || !verified.nonce) {
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect("invalid_state"), appBase));
  }

  const errorParam = params.get("error");
  if (errorParam) {
    return NextResponse.redirect(
      new URL(oauthWebLoginErrorRedirect(errorParam.slice(0, 80)), appBase),
    );
  }

  const code = params.get("code");
  if (!code) {
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect("no_code"), appBase));
  }

  const clientId = (await getAppleOauthClientId()).trim();
  const redirectUri = (await getAppleOauthRedirectUri()).trim();
  const teamId = (await getAppleOauthTeamId()).trim();
  const keyId = (await getAppleOauthKeyId()).trim();
  const privateKey = (await getAppleOauthPrivateKey()).trim();

  if (!clientId || !redirectUri || !teamId || !keyId || !privateKey) {
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect("not_configured"), appBase));
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
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect("apple_jwt_failed"), appBase));
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
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect("exchange_failed"), appBase));
  }

  if (!idToken) {
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect("no_id_token"), appBase));
  }

  let claims: { sub: string; email?: string };
  try {
    claims = await verifyAppleIdToken({
      idToken,
      clientId,
      expectedNonce: verified.nonce,
    });
  } catch {
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect("id_token_invalid"), appBase));
  }

  const userFromForm = parseAppleUserNameJson(params.get("user"));
  const email = claims.email?.trim() || null;
  const displayName = userFromForm;
  const emailVerified = Boolean(email);

  const resolved = await resolveUserIdForWebOAuthLogin(buildAppDeps().oauthBindings, {
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
      return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect("no_identity"), appBase));
    }
    if (r === "email_ambiguous") {
      return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect("email_ambiguous"), appBase));
    }
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect("db_error"), appBase));
  }

  const done = await completeOAuthWebLoginRedirectUrls({
    userId: resolved.userId,
    displayNameHint: displayName?.trim() || email || claims.sub,
  });

  if (!done.ok) {
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect(done.reason), appBase));
  }

  return NextResponse.redirect(done.redirectUrl);
}
