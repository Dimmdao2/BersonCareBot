/**
 * GET /api/admin/google-calendar/calendars
 * Admin-only: returns the list of writable Google Calendars for the connected account.
 */
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/modules/auth/service";
import {
  getGoogleClientId,
  getGoogleClientSecret,
  getGoogleRefreshToken,
} from "@/modules/system-settings/integrationRuntime";
import {
  refreshGoogleAccessToken,
  fetchGoogleCalendarList,
} from "@/modules/google-calendar/googleOAuthHelpers";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const refreshToken = (await getGoogleRefreshToken()).trim();
  if (!refreshToken) {
    return NextResponse.json(
      { ok: false, error: "not_connected", message: "Google Calendar не подключён" },
      { status: 412 },
    );
  }

  const clientId = (await getGoogleClientId()).trim();
  const clientSecret = (await getGoogleClientSecret()).trim();
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { ok: false, error: "not_configured", message: "Google OAuth не настроен" },
      { status: 501 },
    );
  }

  let accessToken: string;
  try {
    accessToken = await refreshGoogleAccessToken({ clientId, clientSecret, refreshToken });
  } catch {
    return NextResponse.json(
      { ok: false, error: "token_expired", message: "Не удалось обновить токен — переподключите Google" },
      { status: 502 },
    );
  }

  try {
    const calendars = await fetchGoogleCalendarList(accessToken);
    return NextResponse.json({ ok: true, calendars });
  } catch {
    return NextResponse.json(
      { ok: false, error: "calendar_list_failed", message: "Не удалось загрузить список календарей" },
      { status: 502 },
    );
  }
}
