import { NextResponse } from 'next/server';
import { env, webappRuntimeDatabaseIsConfigured } from '@/config/env';
import {
  recordAuthRegistrationFailure,
  recordAuthRegistrationSuccess,
  registrationAttemptIdFromOAuthState,
} from '@/app-layer/product-analytics/recordAuthRegistration';
import { exchangeYandexCode, fetchYandexUserInfo } from '@/modules/auth/oauthService';
import { recordAuthLogin } from '@/app-layer/product-analytics/recordAuthLogin';
import { setSessionFromUser } from '@/modules/auth/service';
import { getPostAuthRedirectTarget } from '@/modules/auth/redirectPolicy';
import { reconcileDbRoleWithEnvRole, resolveRoleAsync } from '@/modules/auth/envRole';
import { resolveUserIdForYandexOAuth } from '@/modules/auth/oauthYandexResolve';
import type { OAuthBindingsPort } from '@/modules/auth/oauthBindingsPort';
import type { UserByPhonePort } from '@/modules/auth/userByPhonePort';
import {
  getYandexOauthClientId,
  getYandexOauthClientSecret,
  getYandexOauthRedirectUri,
} from '@/modules/system-settings/integrationRuntime';
import { parseVerifiedSignedOAuthState } from '@/modules/auth/oauthSignedState';
import { enterStaffSecuritySelfPrincipal } from '@/app-layer/principal/staffSecuritySelfPrincipal';
import { isPlatformUserUuid } from '@/shared/platform-user/isPlatformUserUuid';
import { isOAuthProviderEnabled } from '@/modules/auth/authChannelPolicy';

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
  const appBase = env.APP_BASE_URL;
  const redirectToAppQuery = (reason: string): URL =>
    new URL(`/app?oauth=error&reason=${encodeURIComponent(reason)}`, appBase);

  const url = new URL(request.url);
  const stateFromQuery = url.searchParams.get('state') ?? '';

  const verifiedState = parseVerifiedSignedOAuthState(stateFromQuery, 'yandex');
  const attemptId = registrationAttemptIdFromOAuthState(verifiedState);
  if (!verifiedState) {
    await logOAuthFailure(attemptId, 'oauth_csrf', 'callback');
    return NextResponse.json(
      { error: 'oauth_csrf', message: 'Недействительный или просроченный state' },
      { status: 403 },
    );
  }

  // Defense in depth: closes the race window between /oauth/start (which already gates on this
  // toggle) and this callback, in case the admin disables the provider mid-flight (owner ruling
  // 2026-07-24, R2 fail-closed server-side).
  const yandexOAuthEnabled = await isOAuthProviderEnabled('yandex');
  const clientId = (await getYandexOauthClientId()).trim();
  const redirectUri = (await getYandexOauthRedirectUri()).trim();
  const secret = (await getYandexOauthClientSecret()).trim();

  if (!yandexOAuthEnabled || !clientId || !redirectUri || !secret) {
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
      clientId,
      clientSecret: secret,
      redirectUri,
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

  let sessionUser;
  try {
    if (isPlatformUserUuid(resolved.userId)) {
      enterStaffSecuritySelfPrincipal(resolved.userId, 'auth/oauth-yandex:provider-verified-self');
    }
    sessionUser = await deps.userByPhone.findByUserId(resolved.userId);
  } catch {
    await logOAuthFailure(attemptId, 'db_error', 'session_set', resolved.userId);
    return NextResponse.redirect(redirectToAppQuery('db_error'));
  }

  if (!sessionUser) {
    await logOAuthFailure(attemptId, 'session_failed', 'session_set', resolved.userId);
    return NextResponse.redirect(redirectToAppQuery('session_failed'));
  }

  // C-4 (2026-07-26): see the equivalent comment in oauthWebSession.ts — reconciled against the
  // just-read DB role so a resolver that never promotes anyone anymore cannot demote an existing
  // staff account logging in via Yandex OAuth.
  const role = reconcileDbRoleWithEnvRole(
    sessionUser.role,
    await resolveRoleAsync({
      phone: sessionUser.phone,
      telegramId: sessionUser.bindings.telegramId,
      maxId: sessionUser.bindings.maxId,
    }),
  );

  try {
    await setSessionFromUser({
      ...sessionUser,
      role,
      displayName: oauthName?.trim() || sessionUser.displayName || oauthEmail || yandexId,
    });
  } catch {
    await logOAuthFailure(attemptId, 'session_failed', 'session_set', resolved.userId);
    return NextResponse.redirect(redirectToAppQuery('session_failed'));
  }

  await recordAuthLogin({
    userId: sessionUser.userId,
    entryChannel: 'browser',
    authMethod: 'yandex_oauth',
  });

  if (resolved.accountOutcome === 'created') {
    await recordAuthRegistrationSuccess({
      ...LOG_BASE,
      attemptId,
      stage: 'session_set',
      userId: sessionUser.userId,
      contactValue: oauthEmail ?? oauthPhone ?? 'yandex',
      isNewAccount: true,
    });
  }

  const finalRedirect = getPostAuthRedirectTarget(
    role,
    verifiedState.next ?? null,
    null,
    verifiedState.roleLoginPortal ?? null,
  );
  return NextResponse.redirect(new URL(finalRedirect, appBase));
}
