import { describe, expect, it, vi, beforeEach } from "vitest";

const googleMocks = vi.hoisted(() => ({
  getGoogleClientId: vi.fn().mockResolvedValue("cid"),
  getGoogleClientSecret: vi.fn().mockResolvedValue("csec"),
  getGoogleRedirectUri: vi.fn().mockResolvedValue("http://localhost/cb"),
  isGoogleCalendarPlatformAvailable: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/modules/system-settings/integrationRuntime", async (importOriginal) => {
  const m = await importOriginal<typeof import("@/modules/system-settings/integrationRuntime")>();
  return {
    ...m,
    getGoogleClientId: googleMocks.getGoogleClientId,
    getGoogleClientSecret: googleMocks.getGoogleClientSecret,
    getGoogleRedirectUri: googleMocks.getGoogleRedirectUri,
    isGoogleCalendarPlatformAvailable: googleMocks.isGoogleCalendarPlatformAvailable,
  };
});

const exchangeMock = vi.hoisted(() => vi.fn());
const emailMock = vi.hoisted(() => vi.fn());
vi.mock("@/modules/google-calendar/googleOAuthHelpers", () => ({
  exchangeGoogleCode: exchangeMock,
  fetchGoogleUserEmail: emailMock,
}));

const clinicGateMock = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/guards/requireRole", () => ({
  requireClinicManagementApiContext: clinicGateMock,
}));

const updateSettingMock = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    systemSettings: {
      updateSetting: updateSettingMock,
    },
  }),
}));

vi.mock("@/modules/system-settings/configAdapter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/system-settings/configAdapter")>();
  return {
    ...actual,
    invalidateConfigKey: vi.fn(),
  };
});

vi.mock("@/config/env", () => ({
  env: { APP_BASE_URL: "http://localhost", SESSION_COOKIE_SECRET: "test-session-secret-16chars" },
  isProduction: false,
}));

import { createSignedOAuthState } from "@/modules/auth/oauthSignedState";
import { GET } from "./route";

function makeRequest(params: Record<string, string>): Request {
  const url = new URL("http://localhost/api/admin/google-calendar/callback");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

function validGcalState(): string {
  return createSignedOAuthState("gcal", 600, { organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
}

describe("GET /api/admin/google-calendar/callback", () => {
  beforeEach(() => {
    clinicGateMock.mockReset().mockResolvedValue({
      ok: true,
      ctx: { organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", session: { user: { role: "doctor", userId: "admin-1" } } },
    });
    exchangeMock.mockReset();
    emailMock.mockReset();
    updateSettingMock.mockReset().mockResolvedValue({ key: "google_refresh_token", valueJson: {} });
    googleMocks.isGoogleCalendarPlatformAvailable.mockResolvedValue(true);
    emailMock.mockResolvedValue(null);
  });

  it("redirects with error when not authenticated", async () => {
    clinicGateMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 }),
    });
    const res = await GET(makeRequest({ code: "c", state: validGcalState() }));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.headers.get("location") ?? "").toContain("reason=unauthorized");
  });

  it("keeps the redirect contract when the platform guard rejects a foreign audience", async () => {
    clinicGateMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403 }),
    });
    const res = await GET(makeRequest({ code: "c", state: validGcalState() }));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.headers.get("location") ?? "").toContain("reason=unauthorized");
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it("redirects with error on invalid signed state", async () => {
    const res = await GET(makeRequest({ code: "c", state: "wrong" }));
    expect(res.headers.get("location") ?? "").toContain("reason=csrf");
  });

  it("redirects with error when no code", async () => {
    const res = await GET(makeRequest({ state: validGcalState() }));
    expect(res.headers.get("location") ?? "").toContain("reason=no_code");
  });

  it("redirects with error when exchange fails", async () => {
    exchangeMock.mockRejectedValue(new Error("bad"));
    const res = await GET(makeRequest({ code: "bad", state: validGcalState() }));
    expect(res.headers.get("location") ?? "").toContain("reason=exchange_failed");
  });

  it("redirects with error when no refresh token returned", async () => {
    exchangeMock.mockResolvedValue({ accessToken: "at", refreshToken: null });
    const res = await GET(makeRequest({ code: "c", state: validGcalState() }));
    expect(res.headers.get("location") ?? "").toContain("reason=no_refresh_token");
  });

  it("saves refresh token and redirects on success", async () => {
    exchangeMock.mockResolvedValue({ accessToken: "at", refreshToken: "rt" });
    emailMock.mockResolvedValue("user@gmail.com");
    const res = await GET(makeRequest({ code: "good", state: validGcalState() }));
    expect(res.headers.get("location") ?? "").toContain("gcal=connected");
    expect(updateSettingMock).toHaveBeenCalledWith(
      "google_refresh_token",
      "admin",
      { value: "rt" },
      "admin-1",
      { organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    );
    expect(updateSettingMock).toHaveBeenCalledWith(
      "google_connected_email",
      "admin",
      { value: "user@gmail.com" },
      "admin-1",
      { organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    );
  });

  it("handles Google error param", async () => {
    const res = await GET(makeRequest({ error: "access_denied", state: validGcalState() }));
    expect(res.headers.get("location") ?? "").toContain("reason=access_denied");
  });
});
