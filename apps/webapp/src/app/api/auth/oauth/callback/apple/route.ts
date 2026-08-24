import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { env } from '@/config/env';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  logOAuthWebCallbackFailure,
  logOAuthWebCallbackRegistrationSuccess,
} from '@/app-layer/product-analytics/registrationOAuthWebCallback';
import { registrationAttemptIdFromOAuthState } from '@/app-layer/product-analytics/recordAuthRegistration';
import { parseVerifiedSignedOAuthState } from '@/modules/auth/oauthSignedState';
import {
  getAppleOauthClientId,
  getAppleOauthRedirectUri,
  getAppleOauthTeamId,
  getAppleOauthKeyId,
  getAppleOauthPrivateKey,
} from '@/modules/system-settings/integrationRuntime';
import {
  buildAppleClientSecretJwt,
  exchangeAppleAuthorizationCode,
  parseAppleUserNameJson,
  verifyAppleIdToken,
} from '@/modules/auth/appleOAuthHelpers';
import { resolveUserIdForWebOAuthLogin } from '@/modules/auth/oauthWebLoginResolve';
import {
  completeOAuthWebLoginRedirectUrls,
  oauthWebLoginErrorRedirect,
} from '@/modules/auth/oauthWebSession';
import { isOAuthProviderEnabled } from '@/modules/auth/authChannelPolicy';

/**
 * POST /api/auth/oauth/callback/apple — Sign in with Apple (`response_mode=form_post`).
 */
export async function POST(request: Request) {
  stampBootstrapPrincipal('api/auth/oauth/callback/apple:POST', request);
  const appBase = env.APP_BASE_URL;
  if (!(await isOAuthProviderEnabled('apple'))) {
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect('oauth_disabled'), appBase));
  }
  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/x-www-form-urlencoded')) {
    return NextResponse.redirect(
      new URL(oauthWebLoginErrorRedirect('invalid_content_type'), appBase),
    );
  }

  let params: URLSearchParams;
  try {
    const text = await request.text();
    params = new URLSearchParams(text);
  } catch {
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect('invalid_body'), appBase));
  }

  const stateRaw = params.get('state') ?? '';
  const verified = parseVerifiedSignedOAuthState(stateRaw, 'apple');
  const attemptId = registrationAttemptIdFromOAuthState(verified);
  const logBase = {
    attemptId,
    authMethod: 'oauth_apple' as const,
    contactValue: 'apple',
  };
  if (!verified || !verified.nonce) {
    await logOAuthWebCallbackFailure(logBase, 'invalid_state');
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect('invalid_state'), appBase));
  }

  const errorParam = params.get('error');
  if (errorParam) {
    await logOAuthWebCallbackFailure(logBase, errorParam.slice(0, 80));
    return NextResponse.redirect(
      new URL(oauthWebLoginErrorRedirect(errorParam.slice(0, 80)), appBase),
    );
  }

  const code = params.get('code');
  if (!code) {
    await logOAuthWebCallbackFailure(logBase, 'no_code');
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect('no_code'), appBase));
  }

  const clientId = (await getAppleOauthClientId()).trim();
  const redirectUri = (await getAppleOauthRedirectUri()).trim();
  const teamId = (await getAppleOauthTeamId()).trim();
  const keyId = (await getAppleOauthKeyId()).trim();
  const privateKey = (await getAppleOauthPrivateKey()).trim();

  if (!clientId || !redirectUri || !teamId || !keyId || !privateKey) {
    await logOAuthWebCallbackFailure(logBase, 'not_configured');
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect('not_configured'), appBase));
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
    await logOAuthWebCallbackFailure(logBase, 'apple_jwt_failed');
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect('apple_jwt_failed'), appBase));
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
    await logOAuthWebCallbackFailure(logBase, 'exchange_failed');
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect('exchange_failed'), appBase));
  }

  if (!idToken) {
    await logOAuthWebCallbackFailure(logBase, 'no_id_token');
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect('no_id_token'), appBase));
  }

  let claims: { sub: string; email?: string };
  try {
    claims = await verifyAppleIdToken({
      idToken,
      clientId,
      expectedNonce: verified.nonce,
    });
  } catch {
    await logOAuthWebCallbackFailure(logBase, 'id_token_invalid');
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect('id_token_invalid'), appBase));
  }

  const userFromForm = parseAppleUserNameJson(params.get('user'));
  const email = claims.email?.trim() || null;
  const displayName = userFromForm;
  const emailVerified = Boolean(email);

  const deps = buildAppDeps();
  const resolved = await resolveUserIdForWebOAuthLogin(deps.oauthBindings, {
    provider: 'apple',
    providerUserId: claims.sub,
    email,
    emailVerified,
    displayName,
    phone: null,
  });

  if (!resolved.ok) {
    const r = resolved.reason;
    await logOAuthWebCallbackFailure(logBase, r);
    if (r === 'no_identity') {
      return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect('no_identity'), appBase));
    }
    if (r === 'email_ambiguous') {
      return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect('email_ambiguous'), appBase));
    }
    if (r === 'contact_conflict') {
      return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect('contact_conflict'), appBase));
    }
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect('db_error'), appBase));
  }

  await deps.patientCalendarTimezone.syncFromDevice(
    resolved.userId,
    verified.browserCalendarIana ?? null,
  );

  const done = await completeOAuthWebLoginRedirectUrls({
    userId: resolved.userId,
    displayNameHint: displayName?.trim() || email || claims.sub,
    authMethod: 'apple_oauth',
    userByPhone: deps.userByPhone,
    next: verified.next,
    roleLoginPortal: verified.roleLoginPortal,
  });

  if (!done.ok) {
    await logOAuthWebCallbackFailure(logBase, done.reason, 'session_set', resolved.userId);
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect(done.reason), appBase));
  }

  await logOAuthWebCallbackRegistrationSuccess(logBase, resolved.accountOutcome, resolved.userId);

  return NextResponse.redirect(done.redirectUrl);
}
