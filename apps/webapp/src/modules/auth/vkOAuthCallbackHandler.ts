import { NextResponse } from 'next/server';
import { env, webappRuntimeDatabaseIsConfigured } from '@/config/env';
import {
  recordAuthRegistrationFailure,
  recordAuthRegistrationSuccess,
  registrationAttemptIdFromOAuthState,
} from '@/app-layer/product-analytics/recordAuthRegistration';
import { exchangeVkCode, fetchVkUserInfo } from '@/modules/auth/oauthVkService';
import { resolveUserIdForVkOAuth } from '@/modules/auth/oauthVkResolve';
import type { OAuthBindingsPort } from '@/modules/auth/oauthBindingsPort';
import type { UserByPhonePort } from '@/modules/auth/userByPhonePort';
import {
  getVkIdApplicationId,
  getVkIdClientSecret,
  getVkIdRedirectUri,
} from '@/modules/system-settings/integrationRuntime';
import {
  deriveVkPkceCodeVerifier,
  parseVerifiedSignedOAuthState,
  roleLoginPortalFromOAuthState,
} from '@/modules/auth/oauthSignedState';
import { isOAuthProviderEnabled } from '@/modules/auth/authChannelPolicy';
import { notificationText } from '@/shared/notifications/notificationText';
import { authPolicyNameForRoleLoginPortal } from '@/modules/auth/roleLogin';
import { completeOAuthWebLoginRedirectUrls } from '@/modules/auth/oauthWebSession';

const LOG_BASE = {
  authMethod: 'oauth_vk' as const,
  entryChannel: 'browser' as const,
  contactType: 'oauth_provider' as const,
  contactValue: 'vk',
};

export type VkOAuthCallbackDeps = {
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
 * VK ID OAuth callback: signed state → PKCE code exchange → user_info → resolve user → session →
 * redirect. Mirrors `yandexOAuthCallbackHandler.ts`; the only structural difference is VK ID's
 * mandatory PKCE (`device_id` from the redirect query + `code_verifier` derived from the state's
 * own `attemptId`, see `oauthSignedState.ts`).
 */
export async function handleVkOAuthCallbackGet(
  request: Request,
  deps: VkOAuthCallbackDeps,
): Promise<NextResponse> {
  const appBase = env.APP_BASE_URL;
  const redirectToAppQuery = (reason: string): URL =>
    new URL(`/app?oauth=error&reason=${encodeURIComponent(reason)}`, appBase);

  const url = new URL(request.url);
  const stateFromQuery = url.searchParams.get('state') ?? '';

  const verifiedState = parseVerifiedSignedOAuthState(stateFromQuery, 'vk');
  const attemptId = registrationAttemptIdFromOAuthState(verifiedState);
  if (!verifiedState) {
    await logOAuthFailure(attemptId, 'oauth_csrf', 'callback');
    return NextResponse.json(
      { error: 'oauth_csrf', message: notificationText.authOauthLinkStale },
      { status: 403 },
    );
  }
  const roleLoginPortal = roleLoginPortalFromOAuthState(verifiedState);

  // Defense in depth: closes the race window between /oauth/start (which already gates on this
  // toggle) and this callback, in case the admin disables the provider mid-flight (owner ruling
  // 2026-07-24, R2 fail-closed server-side) — same pattern as the other three providers.
  const vkOAuthEnabled = await isOAuthProviderEnabled(
    'vk',
    authPolicyNameForRoleLoginPortal(roleLoginPortal),
  );
  const clientId = (await getVkIdApplicationId()).trim();
  const redirectUri = (await getVkIdRedirectUri()).trim();
  const secret = (await getVkIdClientSecret()).trim();

  if (!vkOAuthEnabled || !clientId || !redirectUri || !secret) {
    await logOAuthFailure(attemptId, 'oauth_disabled', 'callback');
    return NextResponse.redirect(new URL('/app?oauth=disabled&reason=not_configured', appBase));
  }

  const errorParam = url.searchParams.get('error');
  if (errorParam) {
    await logOAuthFailure(attemptId, errorParam.slice(0, 80), 'callback');
    return NextResponse.redirect(redirectToAppQuery(errorParam.slice(0, 80)));
  }

  const code = url.searchParams.get('code');
  const deviceId = url.searchParams.get('device_id');
  if (!code || !deviceId) {
    await logOAuthFailure(attemptId, !code ? 'no_code' : 'no_device_id', 'callback');
    return NextResponse.redirect(redirectToAppQuery(!code ? 'no_code' : 'no_device_id'));
  }

  let accessToken: string;
  try {
    const codeVerifier = deriveVkPkceCodeVerifier(attemptId);
    const tokenResult = await exchangeVkCode(code, {
      clientId,
      clientSecret: secret,
      redirectUri,
      deviceId,
      codeVerifier,
      state: stateFromQuery,
    });
    accessToken = tokenResult.accessToken;
  } catch {
    await logOAuthFailure(attemptId, 'exchange_failed', 'callback');
    return NextResponse.redirect(redirectToAppQuery('exchange_failed'));
  }

  let vkId: string;
  let oauthEmail: string | null;
  let oauthName: string | null;
  let oauthPhone: string | null;
  try {
    const info = await fetchVkUserInfo(accessToken, clientId);
    vkId = info.id;
    oauthEmail = info.email;
    oauthName = info.name;
    oauthPhone = info.phone;
  } catch {
    await logOAuthFailure(attemptId, 'userinfo_failed', 'callback');
    return NextResponse.redirect(redirectToAppQuery('userinfo_failed'));
  }

  const resolved = await resolveUserIdForVkOAuth(deps.oauthBindings, {
    vkId,
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
    displayNameHint: oauthName?.trim() || oauthEmail || vkId,
    authMethod: 'vk_oauth',
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
      contactValue: oauthEmail ?? oauthPhone ?? 'vk',
      isNewAccount: true,
    });
  }

  return NextResponse.redirect(done.redirectUrl);
}
