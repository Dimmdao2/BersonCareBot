/**
 * GET /api/admin/google-calendar/callback
 * Google OAuth callback: exchanges code for tokens, saves refresh_token
 * and connected email to system_settings(admin), redirects to Settings.
 */
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/modules/auth/service";
import {
  getAppBaseUrl,
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
import { verifySignedOAuthState } from "@/modules/auth/oauthSignedState";

async function settingsRedirect(params: Record<string, string>): Promise<NextResponse> {
  const appBase = await getAppBaseUrl();
  const url = new URL("/app/settings", appBase);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session || session.user.role !== "admin") {
    return await settingsRedirect({ gcal: "error", reason: "unauthorized" });
  }

  const url = new URL(request.url);
  const stateFromQuery = url.searchParams.get("state") ?? "";

  if (!stateFromQuery || !verifySignedOAuthState(stateFromQuery, "gcal")) {
    return await settingsRedirect({ gcal: "error", reason: "csrf" });
  }

  const errorParam = url.searchParams.get("error");
  if (errorParam) {
    return await settingsRedirect({ gcal: "error", reason: errorParam });
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return await settingsRedirect({ gcal: "error", reason: "no_code" });
  }

  const clientId = (await getGoogleClientId()).trim();
  const clientSecret = (await getGoogleClientSecret()).trim();
  const redirectUri = (await getGoogleRedirectUri()).trim();

  if (!clientId || !clientSecret || !redirectUri) {
    return await settingsRedirect({ gcal: "error", reason: "not_configured" });
  }

  let accessToken: string;
  let refreshToken: string | null;
  try {
    const tokens = await exchangeGoogleCode(code, { clientId, clientSecret, redirectUri });
    accessToken = tokens.accessToken;
    refreshToken = tokens.refreshToken;
  } catch {
    return await settingsRedirect({ gcal: "error", reason: "exchange_failed" });
  }

  if (!refreshToken) {
    return await settingsRedirect({ gcal: "error", reason: "no_refresh_token" });
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

  return await settingsRedirect({ gcal: "connected" });
}
