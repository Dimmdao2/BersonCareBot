/**
 * GET /api/admin/google-calendar/callback
 * Google OAuth callback: exchanges code for tokens, saves refresh_token
 * and connected email to system_settings(admin), redirects to Settings.
 */
import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { getCurrentSession } from "@/modules/auth/service";
import {
  getGoogleClientId,
  getGoogleClientSecret,
  getGoogleRedirectUri,
} from "@/modules/system-settings/integrationRuntime";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { invalidateConfigKey } from "@/modules/system-settings/configAdapter";
import {
  exchangeGoogleCode,
  fetchGoogleUserEmail,
} from "@/modules/google-calendar/googleOAuthHelpers";

const OAUTH_STATE_COOKIE = "oauth_state_gcal";

function readCookieFromRequest(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const chunk of cookieHeader.split(";")) {
    const eq = chunk.indexOf("=");
    if (eq === -1) continue;
    if (chunk.slice(0, eq).trim() === name) {
      const raw = chunk.slice(eq + 1).trim();
      if (!raw) return null;
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return null;
}

function settingsRedirect(params: Record<string, string>): NextResponse {
  const url = new URL("/app/settings", env.APP_BASE_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_STATE_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session || session.user.role !== "admin") {
    return settingsRedirect({ gcal: "error", reason: "unauthorized" });
  }

  const url = new URL(request.url);
  const stateFromQuery = url.searchParams.get("state") ?? "";
  const stateFromCookie = readCookieFromRequest(request, OAUTH_STATE_COOKIE) ?? "";

  if (!stateFromQuery || !stateFromCookie || stateFromQuery !== stateFromCookie) {
    return settingsRedirect({ gcal: "error", reason: "csrf" });
  }

  const errorParam = url.searchParams.get("error");
  if (errorParam) {
    return settingsRedirect({ gcal: "error", reason: errorParam });
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return settingsRedirect({ gcal: "error", reason: "no_code" });
  }

  const clientId = (await getGoogleClientId()).trim();
  const clientSecret = (await getGoogleClientSecret()).trim();
  const redirectUri = (await getGoogleRedirectUri()).trim();

  if (!clientId || !clientSecret || !redirectUri) {
    return settingsRedirect({ gcal: "error", reason: "not_configured" });
  }

  let accessToken: string;
  let refreshToken: string | null;
  try {
    const tokens = await exchangeGoogleCode(code, { clientId, clientSecret, redirectUri });
    accessToken = tokens.accessToken;
    refreshToken = tokens.refreshToken;
  } catch {
    return settingsRedirect({ gcal: "error", reason: "exchange_failed" });
  }

  if (!refreshToken) {
    return settingsRedirect({ gcal: "error", reason: "no_refresh_token" });
  }

  const deps = buildAppDeps();
  const userId = session.user.userId;

  await deps.systemSettings.updateSetting("google_refresh_token", "admin", { value: refreshToken }, userId);
  invalidateConfigKey("google_refresh_token");

  const email = await fetchGoogleUserEmail(accessToken);
  if (email) {
    await deps.systemSettings.updateSetting("google_connected_email", "admin", { value: email }, userId);
    invalidateConfigKey("google_connected_email");
  }

  return settingsRedirect({ gcal: "connected" });
}
