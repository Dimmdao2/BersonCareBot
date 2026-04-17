import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/config/env", () => ({
  env: {
    APP_BASE_URL: "http://localhost",
    SESSION_COOKIE_SECRET: "test-session-secret-16chars",
  },
}));

import { createSignedOAuthState } from "@/modules/auth/oauthSignedState";

const exchangeMock = vi.fn();
const profileMock = vi.fn();
const resolveMock = vi.fn();
const completeMock = vi.fn();

vi.mock("@/modules/google-calendar/googleOAuthHelpers", () => ({
  exchangeGoogleCode: (...a: unknown[]) => exchangeMock(...a),
  fetchGoogleUserProfile: (...a: unknown[]) => profileMock(...a),
}));

vi.mock("@/modules/auth/oauthWebLoginResolve", () => ({
  resolveUserIdForWebOAuthLogin: (...a: unknown[]) => resolveMock(...a),
}));

vi.mock("@/modules/auth/oauthWebSession", () => ({
  completeOAuthWebLoginRedirectUrls: (...a: unknown[]) => completeMock(...a),
  oauthWebLoginErrorRedirect: (r: string) => `/app?oauth=error&reason=${encodeURIComponent(r)}`,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    oauthBindings: {},
  }),
}));

vi.mock("@/modules/system-settings/integrationRuntime", () => ({
  getAppBaseUrl: vi.fn().mockResolvedValue("http://localhost"),
  getGoogleClientId: vi.fn().mockResolvedValue("cid"),
  getGoogleClientSecret: vi.fn().mockResolvedValue("sec"),
  getGoogleOauthLoginRedirectUri: vi.fn().mockResolvedValue("http://localhost/cb/google"),
}));

import { GET } from "./route";

describe("GET /api/auth/oauth/callback/google", () => {
  beforeEach(() => {
    exchangeMock.mockReset();
    profileMock.mockReset();
    resolveMock.mockReset();
    completeMock.mockReset();
  });

  it("returns 403 when state invalid", async () => {
    const url = new URL("http://localhost/api/auth/oauth/callback/google");
    url.searchParams.set("state", "bad");
    url.searchParams.set("code", "c");
    const res = await GET(new Request(url.toString()));
    expect(res.status).toBe(403);
  });

  it("redirects on success", async () => {
    const state = createSignedOAuthState("google_login", 600);
    exchangeMock.mockResolvedValue({ accessToken: "at", refreshToken: "ignored" });
    profileMock.mockResolvedValue({ sub: "sub1", email: "a@b.c", name: "N", emailVerified: true });
    resolveMock.mockResolvedValue({ ok: true, userId: "u1" });
    completeMock.mockResolvedValue({ ok: true, redirectUrl: "http://localhost/app/patient" });

    const url = new URL("http://localhost/api/auth/oauth/callback/google");
    url.searchParams.set("state", state);
    url.searchParams.set("code", "code1");
    const res = await GET(new Request(url.toString()));
    expect([302, 307]).toContain(res.status);
    expect(res.headers.get("location")).toBe("http://localhost/app/patient");
    expect(exchangeMock).toHaveBeenCalled();
  });
});
