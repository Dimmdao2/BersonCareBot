/**
 * Pure HTTP helpers for Google OAuth2 token exchange and Calendar API.
 * No framework dependency — testable with nock/mocked fetch.
 */

export type GoogleTokenResult = {
  accessToken: string;
  refreshToken: string | null;
};

export type GoogleCalendarListItem = {
  id: string;
  summary: string;
  primary: boolean;
};

export async function exchangeGoogleCode(
  code: string,
  opts: { clientId: string; clientSecret: string; redirectUri: string },
): Promise<GoogleTokenResult> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`google_token_exchange_failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as Record<string, unknown>;
  const accessToken = typeof json.access_token === "string" ? json.access_token : "";
  const refreshToken = typeof json.refresh_token === "string" ? json.refresh_token : null;
  if (!accessToken) throw new Error("google_token_missing_access_token");
  return { accessToken, refreshToken };
}

export async function refreshGoogleAccessToken(opts: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      refresh_token: opts.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`google_refresh_failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as Record<string, unknown>;
  const accessToken = typeof json.access_token === "string" ? json.access_token : "";
  if (!accessToken) throw new Error("google_refresh_missing_access_token");
  return accessToken;
}

export async function fetchGoogleCalendarList(
  accessToken: string,
): Promise<GoogleCalendarListItem[]> {
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`google_calendar_list_failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { items?: Array<Record<string, unknown>> };
  if (!Array.isArray(json.items)) return [];
  return json.items.map((item) => ({
    id: typeof item.id === "string" ? item.id : "",
    summary: typeof item.summary === "string" ? item.summary : "",
    primary: item.primary === true,
  }));
}

export async function fetchGoogleUserEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown>;
    return typeof json.email === "string" ? json.email : null;
  } catch {
    return null;
  }
}

export type GoogleUserProfile = {
  sub: string;
  email: string | null;
  name: string | null;
  /** Только при `true` email считается подтверждённым Google (merge / `email_verified_at`). */
  emailVerified: boolean;
};

export async function fetchGoogleUserProfile(accessToken: string): Promise<GoogleUserProfile | null> {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown>;
    const sub = typeof json.id === "string" ? json.id : "";
    if (!sub) return null;
    const email = typeof json.email === "string" ? json.email : null;
    const name = typeof json.name === "string" ? json.name : null;
    const emailVerified = json.verified_email === true;
    return { sub, email, name, emailVerified };
  } catch {
    return null;
  }
}
