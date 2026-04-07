/**
 * POST /api/admin/google-calendar/start
 * Admin-only: generates Google OAuth authorize URL for Calendar integration.
 * Returns { ok, authUrl } or error. Sets httpOnly state cookie for CSRF.
 */
import { NextResponse } from "next/server";
import { isProduction } from "@/config/env";
import { getCurrentSession } from "@/modules/auth/service";
import {
  getGoogleClientId,
  getGoogleClientSecret,
  getGoogleRedirectUri,
} from "@/modules/system-settings/integrationRuntime";

const OAUTH_STATE_COOKIE = "oauth_state_gcal";
const OAUTH_STATE_TTL_SECONDS = 600;

const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

export async function POST() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const clientId = (await getGoogleClientId()).trim();
  const clientSecret = (await getGoogleClientSecret()).trim();
  const redirectUri = (await getGoogleRedirectUri()).trim();

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      { ok: false, error: "not_configured", message: "Google OAuth не настроен (client_id / client_secret / redirect_uri)" },
      { status: 501 },
    );
  }

  const state = crypto.randomUUID();

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  const res = NextResponse.json({ ok: true, authUrl: authUrl.toString() });
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: OAUTH_STATE_TTL_SECONDS,
  });
  return res;
}
