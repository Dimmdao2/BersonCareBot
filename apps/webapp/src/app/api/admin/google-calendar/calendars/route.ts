/**
 * GET /api/admin/google-calendar/calendars
 * Admin-only: returns the list of writable Google Calendars for the connected account.
 */
import { NextResponse } from 'next/server';
import { requireClinicManagementApiContext } from '@/app-layer/guards/requireRole';
import {
  getGoogleClientId,
  getGoogleClientSecret,
  getGoogleRefreshToken,
  isGoogleCalendarPlatformAvailable,
} from '@/modules/system-settings/integrationRuntime';
import {
  refreshGoogleAccessToken,
  fetchGoogleCalendarList,
} from '@/modules/google-calendar/googleOAuthHelpers';
import { notificationText } from '@/shared/notifications/notificationText';

export async function GET() {
  const gate = await requireClinicManagementApiContext();
  if (!gate.ok) return gate.response;
  if (!(await isGoogleCalendarPlatformAvailable())) {
    return NextResponse.json({ ok: false, error: 'integration_disabled' }, { status: 403 });
  }

  const refreshToken = (await getGoogleRefreshToken(gate.ctx.organizationId)).trim();
  if (!refreshToken) {
    return NextResponse.json(
      { ok: false, error: 'not_connected', message: notificationText.adminGoogleCalendarNotConnected },
      { status: 412 },
    );
  }

  const clientId = (await getGoogleClientId()).trim();
  const clientSecret = (await getGoogleClientSecret()).trim();
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { ok: false, error: 'not_configured', message: notificationText.adminGoogleOauthNotConfigured },
      { status: 501 },
    );
  }

  let accessToken: string;
  try {
    accessToken = await refreshGoogleAccessToken({ clientId, clientSecret, refreshToken });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: 'token_expired',
        message: notificationText.adminGoogleReconnectRequired,
      },
      { status: 502 },
    );
  }

  try {
    const calendars = await fetchGoogleCalendarList(accessToken);
    return NextResponse.json({ ok: true, calendars });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: 'calendar_list_failed',
        message: notificationText.adminGoogleCalendarListFailed,
      },
      { status: 502 },
    );
  }
}
