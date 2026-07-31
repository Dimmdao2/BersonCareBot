/**
 * POST /api/admin/google-calendar/start
 * Admin-only: generates Google OAuth authorize URL for Calendar integration.
 * Returns { ok, authUrl } or error. Подписанный state (без cookie).
 */
import { NextResponse } from 'next/server';
import { requireClinicManagementApiContext } from '@/app-layer/guards/requireRole';
import {
  entitlementMutationRefusalResponse,
  requireEntitlementForMutation,
} from '@/app-layer/guards/requireEntitlement';
import { createSignedOAuthState } from '@/modules/auth/oauthSignedState';
import {
  getGoogleClientId,
  getGoogleClientSecret,
  getGoogleRedirectUri,
  isGoogleCalendarPlatformAvailable,
} from '@/modules/system-settings/integrationRuntime';

const OAUTH_STATE_TTL_SECONDS = 600;

const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

export async function POST() {
  const gate = await requireClinicManagementApiContext();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForMutation(gate.ctx, 'external_calendar');
  if (!entitlement.ok) {
    return entitlementMutationRefusalResponse('external_calendar', 'подключить внешний календарь');
  }
  if (!(await isGoogleCalendarPlatformAvailable())) {
    return NextResponse.json({ ok: false, error: 'integration_disabled' }, { status: 403 });
  }

  const clientId = (await getGoogleClientId()).trim();
  const clientSecret = (await getGoogleClientSecret()).trim();
  const redirectUri = (await getGoogleRedirectUri()).trim();

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      {
        ok: false,
        error: 'not_configured',
        message: 'Google OAuth не настроен (client_id / client_secret / redirect_uri)',
      },
      { status: 501 },
    );
  }

  const state = createSignedOAuthState('gcal', OAUTH_STATE_TTL_SECONDS, {
    organizationId: gate.ctx.organizationId,
  });

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', GOOGLE_CALENDAR_SCOPES);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);

  return NextResponse.json({ ok: true, authUrl: authUrl.toString() });
}
