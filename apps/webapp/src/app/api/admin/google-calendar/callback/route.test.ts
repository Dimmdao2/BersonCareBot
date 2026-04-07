import { describe, expect, it, vi, beforeEach } from "vitest";

const googleMocks = vi.hoisted(() => ({
  getGoogleClientId: vi.fn().mockResolvedValue("cid"),
  getGoogleClientSecret: vi.fn().mockResolvedValue("csec"),
  getGoogleRedirectUri: vi.fn().mockResolvedValue("http://localhost/cb"),
}));

vi.mock("@/modules/system-settings/integrationRuntime", async (importOriginal) => {
  const m = await importOriginal<typeof import("@/modules/system-settings/integrationRuntime")>();
  return {
    ...m,
    getGoogleClientId: googleMocks.getGoogleClientId,
    getGoogleClientSecret: googleMocks.getGoogleClientSecret,
    getGoogleRedirectUri: googleMocks.getGoogleRedirectUri,
  };
});

const exchangeMock = vi.hoisted(() => vi.fn());
const emailMock = vi.hoisted(() => vi.fn());
vi.mock("@/modules/google-calendar/googleOAuthHelpers", () => ({
  exchangeGoogleCode: exchangeMock,
  fetchGoogleUserEmail: emailMock,
}));

const sessionMock = vi.hoisted(() => vi.fn());
vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: sessionMock,
}));

const updateSettingMock = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    systemSettings: {
      updateSetting: updateSettingMock,
    },
  }),
}));

vi.mock("@/modules/system-settings/configAdapter", () => ({
  invalidateConfigKey: vi.fn(),
}));

vi.mock("@/config/env", () => ({
  env: { APP_BASE_URL: "http://localhost" },
  isProduction: false,
}));

import { GET } from "./route";

const STATE = "test-state-uuid";

function makeRequest(params: Record<string, string>, cookieState?: string): Request {
  const url = new URL("http://localhost/api/admin/google-calendar/callback");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = {};
  if (cookieState !== undefined) {
    headers["cookie"] = `oauth_state_gcal=${cookieState}`;
  }
  return new Request(url.toString(), { headers });
}

describe("GET /api/admin/google-calendar/callback", () => {
  beforeEach(() => {
    sessionMock.mockResolvedValue({ user: { role: "admin", userId: "admin-1" } });
    exchangeMock.mockReset();
    emailMock.mockReset();
    updateSettingMock.mockReset().mockResolvedValue({ key: "google_refresh_token", valueJson: {} });
    emailMock.mockResolvedValue(null);
  });

  it("redirects with error when not authenticated", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await GET(makeRequest({ code: "c", state: STATE }, STATE));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.headers.get("location") ?? "").toContain("reason=unauthorized");
  });

  it("redirects with error on CSRF mismatch", async () => {
    const res = await GET(makeRequest({ code: "c", state: "wrong" }, STATE));
    expect(res.headers.get("location") ?? "").toContain("reason=csrf");
  });

  it("redirects with error when no code", async () => {
    const res = await GET(makeRequest({ state: STATE }, STATE));
    expect(res.headers.get("location") ?? "").toContain("reason=no_code");
  });

  it("redirects with error when exchange fails", async () => {
    exchangeMock.mockRejectedValue(new Error("bad"));
    const res = await GET(makeRequest({ code: "bad", state: STATE }, STATE));
    expect(res.headers.get("location") ?? "").toContain("reason=exchange_failed");
  });

  it("redirects with error when no refresh token returned", async () => {
    exchangeMock.mockResolvedValue({ accessToken: "at", refreshToken: null });
    const res = await GET(makeRequest({ code: "c", state: STATE }, STATE));
    expect(res.headers.get("location") ?? "").toContain("reason=no_refresh_token");
  });

  it("saves refresh token and redirects on success", async () => {
    exchangeMock.mockResolvedValue({ accessToken: "at", refreshToken: "rt" });
    emailMock.mockResolvedValue("user@gmail.com");
    const res = await GET(makeRequest({ code: "good", state: STATE }, STATE));
    expect(res.headers.get("location") ?? "").toContain("gcal=connected");
    expect(updateSettingMock).toHaveBeenCalledWith(
      "google_refresh_token",
      "admin",
      { value: "rt" },
      "admin-1",
    );
    expect(updateSettingMock).toHaveBeenCalledWith(
      "google_connected_email",
      "admin",
      { value: "user@gmail.com" },
      "admin-1",
    );
  });

  it("handles Google error param", async () => {
    const res = await GET(makeRequest({ error: "access_denied", state: STATE }, STATE));
    expect(res.headers.get("location") ?? "").toContain("reason=access_denied");
  });
});
