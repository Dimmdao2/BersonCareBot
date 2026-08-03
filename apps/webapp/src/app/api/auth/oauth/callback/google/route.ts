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
  getGoogleClientId,
  getGoogleClientSecret,
  getGoogleOauthLoginRedirectUri,
} from '@/modules/system-settings/integrationRuntime';
import {
  exchangeGoogleCode,
  fetchGoogleUserProfile,
} from '@/modules/google-calendar/googleOAuthHelpers';
import { resolveUserIdForWebOAuthLogin } from '@/modules/auth/oauthWebLoginResolve';
import {
  completeOAuthWebLoginRedirectUrls,
  oauthWebLoginErrorRedirect,
} from '@/modules/auth/oauthWebSession';
import { isOAuthProviderEnabled } from '@/modules/auth/authChannelPolicy';

/**
 * GET /api/auth/oauth/callback/google — веб-логин Google (не календарь). Refresh token не сохраняем.
 */
export async function GET(request: Request) {
  stampBootstrapPrincipal('api/auth/oauth/callback/google:GET', request);
  const appBase = env.APP_BASE_URL;
  const url = new URL(request.url);
  const stateFromQuery = url.searchParams.get('state') ?? '';
  const verifiedState = parseVerifiedSignedOAuthState(stateFromQuery, 'google_login');
  const attemptId = registrationAttemptIdFromOAuthState(verifiedState);
  const logBase = {
    attemptId,
    authMethod: 'oauth_google' as const,
    contactValue: 'google',
  };
  if (!verifiedState) {
    await logOAuthWebCallbackFailure(logBase, 'oauth_csrf');
    return NextResponse.json(
      { error: 'oauth_csrf', message: 'Недействительный или просроченный state' },
      { status: 403 },
    );
  }

  const deps = buildAppDeps();
  // Defense in depth: closes the race window between /oauth/start (which already gates on this
  // toggle) and this callback, in case the admin disables the provider mid-flight (owner ruling
  // 2026-07-24, R2 fail-closed server-side).
  const googleOAuthEnabled = await isOAuthProviderEnabled('google');
  const clientId = (await getGoogleClientId()).trim();
  const clientSecret = (await getGoogleClientSecret()).trim();
  const redirectUri = (await getGoogleOauthLoginRedirectUri()).trim();

  if (!googleOAuthEnabled || !clientId || !clientSecret || !redirectUri) {
    await logOAuthWebCallbackFailure(logBase, 'oauth_disabled');
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect('not_configured'), appBase));
  }

  const errorParam = url.searchParams.get('error');
  if (errorParam) {
    await logOAuthWebCallbackFailure(logBase, errorParam.slice(0, 80));
    return NextResponse.redirect(
      new URL(oauthWebLoginErrorRedirect(errorParam.slice(0, 80)), appBase),
    );
  }

  const code = url.searchParams.get('code');
  if (!code) {
    await logOAuthWebCallbackFailure(logBase, 'no_code');
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect('no_code'), appBase));
  }

  let accessToken: string;
  try {
    const tokens = await exchangeGoogleCode(code, { clientId, clientSecret, redirectUri });
    accessToken = tokens.accessToken;
    void tokens.refreshToken;
  } catch {
    await logOAuthWebCallbackFailure(logBase, 'exchange_failed');
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect('exchange_failed'), appBase));
  }

  const profile = await fetchGoogleUserProfile(accessToken);
  if (!profile) {
    await logOAuthWebCallbackFailure(logBase, 'userinfo_failed');
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect('userinfo_failed'), appBase));
  }

  const resolved = await resolveUserIdForWebOAuthLogin(deps.oauthBindings, {
    provider: 'google',
    providerUserId: profile.sub,
    email: profile.email,
    emailVerified: profile.emailVerified,
    displayName: profile.name,
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

  await deps.patientCalendarTimezone.trySetInitialIfEmpty(
    resolved.userId,
    verifiedState.browserCalendarIana ?? null,
  );

  const done = await completeOAuthWebLoginRedirectUrls({
    userId: resolved.userId,
    displayNameHint: profile.name?.trim() || profile.email || profile.sub,
    authMethod: 'google_oauth',
    userByPhone: deps.userByPhone,
    next: verifiedState.next,
    roleLoginPortal: verifiedState.roleLoginPortal,
  });

  if (!done.ok) {
    await logOAuthWebCallbackFailure(logBase, done.reason, 'session_set', resolved.userId);
    return NextResponse.redirect(new URL(oauthWebLoginErrorRedirect(done.reason), appBase));
  }

  await logOAuthWebCallbackRegistrationSuccess(logBase, resolved.accountOutcome, resolved.userId);

  return NextResponse.redirect(done.redirectUrl);
}
