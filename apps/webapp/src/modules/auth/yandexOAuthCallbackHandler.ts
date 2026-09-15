import { NextResponse } from 'next/server';
import { env, webappRuntimeDatabaseIsConfigured } from '@/config/env';
import {
  recordAuthRegistrationFailure,
  recordAuthRegistrationSuccess,
  registrationAttemptIdFromOAuthState,
} from '@/app-layer/product-analytics/recordAuthRegistration';
import { exchangeYandexCode, fetchYandexUserInfo } from '@/modules/auth/oauthService';
import { resolveUserIdForYandexOAuth } from '@/modules/auth/oauthYandexResolve';
import type { OAuthBindingsPort } from '@/modules/auth/oauthBindingsPort';
import type { UserByPhonePort } from '@/modules/auth/userByPhonePort';
import {
  parseVerifiedSignedOAuthState,
  roleLoginPortalFromOAuthState,
} from '@/modules/auth/oauthSignedState';
import { getResolvedSurface } from '@/shared/lib/surface/requestSurface.server';
import {
  resolveYandexOAuthConfig,
  yandexOAuthStateMatchesSurface,
} from '@/modules/auth/yandexOAuthConfig';
import { notificationText } from '@/shared/notifications/notificationText';
import { authPolicyNameForRoleLoginPortal } from '@/modules/auth/roleLogin';
import { completeOAuthWebLoginRedirectUrls } from '@/modules/auth/oauthWebSession';

const LOG_BASE = {
  authMethod: 'oauth_yandex' as const,
  entryChannel: 'browser' as const,
  contactType: 'oauth_provider' as const,
  contactValue: 'yandex',
};

export type YandexOAuthCallbackDeps = {
  oauthBindings: OAuthBindingsPort;
  userByPhone: UserByPhonePort;
  patientCalendarTimezone: {
    syncFromDevice(userId: string, raw: string | null): Promise<boolean>;
  };
};

async function logOAuthFailure(
  attemptId: string,
  errorCode: string,
  stage: 'callback' | 'session_set',
  userId?: string | null,
) {
  await recordAuthRegistrationFailure({
    ...LOG_BASE,
    attemptId,
    stage,
    userId,
    errorCode,
  });
}

/**
 * Yandex OAuth callback: signed state → code → token → userinfo → resolve user → session → redirect.
 * Used by {@link GET} on `/api/auth/oauth/callback/yandex` and legacy `/api/auth/oauth/callback`.
 */
export async function handleYandexOAuthCallbackGet(
  request: Request,
  deps: YandexOAuthCallbackDeps,
): Promise<NextResponse> {
  const url = new URL(request.url);
  const stateFromQuery = url.searchParams.get('state') ?? '';

  const verifiedState = parseVerifiedSignedOAuthState(stateFromQuery, 'yandex');
  const attemptId = registrationAttemptIdFromOAuthState(verifiedState);
  if (!verifiedState) {
    await logOAuthFailure(attemptId, 'oauth_csrf', 'callback');
    return NextResponse.json(
      { error: 'oauth_csrf', message: notificationText.authOauthLinkStale },
      { status: 403 },
    );
  }
  const roleLoginPortal = roleLoginPortalFromOAuthState(verifiedState);

  const surface = await getResolvedSurface();
  const appBase = surface.surface === 'patient_default' || surface.surface === 'patient_branded'
    ? surface.publicOrigin
    : env.APP_BASE_URL;
  const redirectToAppQuery = (reason: string): URL =>
    new URL(`/app?oauth=error&reason=${encodeURIComponent(reason)}`, appBase);
  const config = await resolveYandexOAuthConfig(
    surface,
    authPolicyNameForRoleLoginPortal(roleLoginPortal),
  );
  if (
    !config ||
    !yandexOAuthStateMatchesSurface(verifiedState, surface)
  ) {
    await logOAuthFailure(attemptId, 'oauth_disabled', 'callback');
    return NextResponse.redirect(new URL('/app?oauth=disabled&reason=not_configured', appBase));
  }

  const errorParam = url.searchParams.get('error');
  if (errorParam) {
    await logOAuthFailure(attemptId, errorParam.slice(0, 80), 'callback');
    return NextResponse.redirect(redirectToAppQuery(errorParam.slice(0, 80)));
  }

  const code = url.searchParams.get('code');
  if (!code) {
    await logOAuthFailure(attemptId, 'no_code', 'callback');
    return NextResponse.redirect(redirectToAppQuery('no_code'));
  }

  let accessToken: string;
  try {
    const tokenResult = await exchangeYandexCode(code, {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
    });
    accessToken = tokenResult.accessToken;
  } catch {
    await logOAuthFailure(attemptId, 'exchange_failed', 'callback');
    return NextResponse.redirect(redirectToAppQuery('exchange_failed'));
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
    await logOAuthFailure(attemptId, 'userinfo_failed', 'callback');
    return NextResponse.redirect(redirectToAppQuery('userinfo_failed'));
  }

  const resolved = await resolveUserIdForYandexOAuth(deps.oauthBindings, {
    yandexId,
    email: oauthEmail,
    displayName: oauthName,
    phone: oauthPhone,
  });

  if (!resolved.ok) {
    const r = resolved.reason;
    await logOAuthFailure(attemptId, r, 'callback');
    if (r === 'no_identity') {
      return NextResponse.redirect(redirectToAppQuery('no_identity'));
    }
    if (r === 'email_ambiguous') {
      return NextResponse.redirect(redirectToAppQuery('email_ambiguous'));
    }
    if (r === 'contact_conflict') {
      return NextResponse.redirect(redirectToAppQuery('contact_conflict'));
    }
    return NextResponse.redirect(redirectToAppQuery('db_error'));
  }

  if (webappRuntimeDatabaseIsConfigured()) {
    await deps.patientCalendarTimezone.syncFromDevice(
      resolved.userId,
      verifiedState.browserCalendarIana ?? null,
    );
  }

  const done = await completeOAuthWebLoginRedirectUrls({
    userId: resolved.userId,
    displayNameHint: oauthName?.trim() || oauthEmail || yandexId,
    authMethod: 'yandex_oauth',
    userByPhone: deps.userByPhone,
    next: verifiedState.next,
    roleLoginPortal,
    appBaseUrl: appBase,
  });

  if (!done.ok) {
    await logOAuthFailure(attemptId, done.reason, 'session_set', resolved.userId);
    return NextResponse.redirect(redirectToAppQuery(done.reason));
  }

  if (resolved.accountOutcome === 'created') {
    await recordAuthRegistrationSuccess({
      ...LOG_BASE,
      attemptId,
      stage: 'session_set',
      userId: resolved.userId,
      contactValue: oauthEmail ?? oauthPhone ?? 'yandex',
      isNewAccount: true,
    });
  }

  return NextResponse.redirect(done.redirectUrl);
}
