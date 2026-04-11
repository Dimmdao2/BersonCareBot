import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/system-settings/integrationRuntime", () => ({
  getAppleOauthClientId: vi.fn().mockResolvedValue(""),
  getAppleOauthRedirectUri: vi.fn().mockResolvedValue(""),
  getAppleOauthTeamId: vi.fn().mockResolvedValue(""),
  getAppleOauthKeyId: vi.fn().mockResolvedValue(""),
  getAppleOauthPrivateKey: vi.fn().mockResolvedValue(""),
}));

vi.mock("@/config/env", () => ({
  env: {
    APP_BASE_URL: "http://localhost",
    SESSION_COOKIE_SECRET: "test-session-secret-16chars",
  },
  webappReposAreInMemory: () => true,
}));

import { POST } from "./route";

describe("POST /api/auth/oauth/callback/apple", () => {
  it("redirects to app when content-type is not form-urlencoded", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/oauth/callback/apple", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect([302, 307]).toContain(res.status);
    expect(res.headers.get("location")).toContain("oauth=error");
    expect(res.headers.get("location")).toContain("invalid_content_type");
  });

  it("redirects to app when state invalid", async () => {
    const body = new URLSearchParams({ state: "x", code: "c" });
    const res = await POST(
      new Request("http://localhost/api/auth/oauth/callback/apple", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      }),
    );
    expect([302, 307]).toContain(res.status);
    expect(res.headers.get("location")).toContain("invalid_state");
  });
});
