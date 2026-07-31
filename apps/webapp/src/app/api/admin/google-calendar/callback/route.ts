/**
 * GET /api/admin/google-calendar/callback
 * Google OAuth callback: exchanges code for tokens, saves refresh_token
 * and connected email to system_settings(admin), redirects to Settings.
 */
import { NextResponse } from 'next/server';
import { env } from '@/config/env';
import { requireClinicManagementApiContext } from '@/app-layer/guards/requireRole';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import {
  getGoogleClientId,
  getGoogleClientSecret,
  getGoogleRedirectUri,
  isGoogleCalendarPlatformAvailable,
} from '@/modules/system-settings/integrationRuntime';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { invalidateConfigKey } from '@/modules/system-settings/configAdapter';
import {
  exchangeGoogleCode,
  fetchGoogleUserEmail,
} from '@/modules/google-calendar/googleOAuthHelpers';
import { parseVerifiedSignedOAuthState } from '@/modules/auth/oauthSignedState';

async function settingsRedirect(params: Record<string, string>): Promise<NextResponse> {
  const appBase = env.APP_BASE_URL;
  const url = new URL('/app/settings', appBase);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const gate = await requireClinicManagementApiContext();
  if (!gate.ok) {
    return await settingsRedirect({ gcal: 'error', reason: 'unauthorized' });
  }
  const { session, organizationId } = gate.ctx;
  const entitlement = await requireEntitlementForMutation(gate.ctx, 'external_calendar');
  if (!entitlement.ok) {
    return await settingsRedirect({ gcal: 'error', reason: 'tariff_disabled' });
  }

  const url = new URL(request.url);
  const stateFromQuery = url.searchParams.get('state') ?? '';

  const state = stateFromQuery ? parseVerifiedSignedOAuthState(stateFromQuery, 'gcal') : null;
  if (!state || state.organizationId !== organizationId) {
    return await settingsRedirect({ gcal: 'error', reason: 'csrf' });
  }
  if (!(await isGoogleCalendarPlatformAvailable())) {
    return await settingsRedirect({ gcal: 'error', reason: 'integration_disabled' });
  }

  const errorParam = url.searchParams.get('error');
  if (errorParam) {
    return await settingsRedirect({ gcal: 'error', reason: errorParam });
  }

  const code = url.searchParams.get('code');
  if (!code) {
    return await settingsRedirect({ gcal: 'error', reason: 'no_code' });
  }

  const clientId = (await getGoogleClientId()).trim();
  const clientSecret = (await getGoogleClientSecret()).trim();
  const redirectUri = (await getGoogleRedirectUri()).trim();

  if (!clientId || !clientSecret || !redirectUri) {
    return await settingsRedirect({ gcal: 'error', reason: 'not_configured' });
  }

  let accessToken: string;
  let refreshToken: string | null;
  try {
    const tokens = await exchangeGoogleCode(code, { clientId, clientSecret, redirectUri });
    accessToken = tokens.accessToken;
    refreshToken = tokens.refreshToken;
  } catch {
    return await settingsRedirect({ gcal: 'error', reason: 'exchange_failed' });
  }

  if (!refreshToken) {
    return await settingsRedirect({ gcal: 'error', reason: 'no_refresh_token' });
  }

  const deps = buildAppDeps();
  const userId = session.user.userId;

  await deps.systemSettings.updateSetting(
    'google_refresh_token',
    'admin',
    { value: refreshToken },
    userId,
    { organizationId },
  );
  invalidateConfigKey('google_refresh_token');

  const email = await fetchGoogleUserEmail(accessToken);
  if (email) {
    await deps.systemSettings.updateSetting(
      'google_connected_email',
      'admin',
      { value: email },
      userId,
      { organizationId },
    );
    invalidateConfigKey('google_connected_email');
  }

  return await settingsRedirect({ gcal: 'connected' });
}
