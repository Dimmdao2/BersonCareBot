import { describe, expect, it, vi, beforeEach } from "vitest";

const googleMocks = vi.hoisted(() => ({
  getGoogleClientId: vi.fn().mockResolvedValue(""),
  getGoogleClientSecret: vi.fn().mockResolvedValue(""),
  getGoogleRedirectUri: vi.fn().mockResolvedValue(""),
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

const sessionMock = vi.hoisted(() => vi.fn());
vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: sessionMock,
}));

vi.mock("@/config/env", () => ({
  env: { APP_BASE_URL: "http://localhost", SESSION_COOKIE_SECRET: "test-session-secret-16chars" },
  isProduction: false,
}));

import { POST } from "./route";

describe("POST /api/admin/google-calendar/start", () => {
  beforeEach(() => {
    googleMocks.getGoogleClientId.mockResolvedValue("");
    googleMocks.getGoogleClientSecret.mockResolvedValue("");
    googleMocks.getGoogleRedirectUri.mockResolvedValue("");
    sessionMock.mockResolvedValue(null);
  });

  it("returns 401 when not authenticated", async () => {
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("returns 403 when not admin", async () => {
    sessionMock.mockResolvedValue({ user: { role: "client", userId: "u1" } });
    const res = await POST();
    expect(res.status).toBe(403);
  });

  it("returns 501 when Google OAuth not configured", async () => {
    sessionMock.mockResolvedValue({ user: { role: "admin", userId: "u1" } });
    const res = await POST();
    expect(res.status).toBe(501);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("not_configured");
  });

  it("returns 200 with authUrl when credentials present", async () => {
    sessionMock.mockResolvedValue({ user: { role: "admin", userId: "u1" } });
    googleMocks.getGoogleClientId.mockResolvedValue("test-client-id");
    googleMocks.getGoogleClientSecret.mockResolvedValue("test-secret");
    googleMocks.getGoogleRedirectUri.mockResolvedValue("http://localhost/api/admin/google-calendar/callback");

    const res = await POST();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; authUrl: string };
    expect(data.ok).toBe(true);
    expect(data.authUrl).toContain("accounts.google.com/o/oauth2");
    expect(data.authUrl).toContain("client_id=test-client-id");
    expect(data.authUrl).toContain("access_type=offline");
    expect(data.authUrl).toContain("prompt=consent");
    const u = new URL(data.authUrl);
    const state = u.searchParams.get("state") ?? "";
    expect(state.startsWith("v1.")).toBe(true);
  });
});
