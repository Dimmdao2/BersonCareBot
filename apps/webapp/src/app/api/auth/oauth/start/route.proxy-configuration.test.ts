/**
 * Production: missing X-Real-IP must fail before OAuth body handling (proxy invariant).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const oauthMocks = vi.hoisted(() => ({
  getYandexOauthClientId: vi.fn().mockResolvedValue(""),
  getYandexOauthClientSecret: vi.fn().mockResolvedValue(""),
  getYandexOauthRedirectUri: vi.fn().mockResolvedValue(""),
  getGoogleClientId: vi.fn().mockResolvedValue(""),
  getGoogleClientSecret: vi.fn().mockResolvedValue(""),
  getGoogleOauthLoginRedirectUri: vi.fn().mockResolvedValue(""),
  getAppleOauthClientId: vi.fn().mockResolvedValue(""),
  getAppleOauthRedirectUri: vi.fn().mockResolvedValue(""),
  getAppleOauthTeamId: vi.fn().mockResolvedValue(""),
  getAppleOauthKeyId: vi.fn().mockResolvedValue(""),
  getAppleOauthPrivateKey: vi.fn().mockResolvedValue(""),
}));

vi.mock("@/modules/system-settings/integrationRuntime", async (importOriginal) => {
  const m = await importOriginal<typeof import("@/modules/system-settings/integrationRuntime")>();
  return {
    ...m,
    getYandexOauthClientId: oauthMocks.getYandexOauthClientId,
    getYandexOauthClientSecret: oauthMocks.getYandexOauthClientSecret,
    getYandexOauthRedirectUri: oauthMocks.getYandexOauthRedirectUri,
    getGoogleClientId: oauthMocks.getGoogleClientId,
    getGoogleClientSecret: oauthMocks.getGoogleClientSecret,
    getGoogleOauthLoginRedirectUri: oauthMocks.getGoogleOauthLoginRedirectUri,
    getAppleOauthClientId: oauthMocks.getAppleOauthClientId,
    getAppleOauthRedirectUri: oauthMocks.getAppleOauthRedirectUri,
    getAppleOauthTeamId: oauthMocks.getAppleOauthTeamId,
    getAppleOauthKeyId: oauthMocks.getAppleOauthKeyId,
    getAppleOauthPrivateKey: oauthMocks.getAppleOauthPrivateKey,
  };
});

vi.mock("@/config/env", () => ({
  env: {
    NODE_ENV: "production",
    SESSION_COOKIE_SECRET: "test-session-secret-16chars",
  },
}));

import { POST } from "./route";

describe("POST /api/auth/oauth/start (production proxy invariant)", () => {
  beforeEach(() => {
    oauthMocks.getYandexOauthClientId.mockResolvedValue("");
    oauthMocks.getYandexOauthClientSecret.mockResolvedValue("");
    oauthMocks.getYandexOauthRedirectUri.mockResolvedValue("");
  });

  it("returns 503 proxy_configuration when X-Real-IP is missing", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/oauth/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "yandex" }),
      }),
    );
    expect(res.status).toBe(503);
    const data = (await res.json()) as { ok: boolean; error: string };
    expect(data.ok).toBe(false);
    expect(data.error).toBe("proxy_configuration");
  });

  it("returns 200 with authUrl when X-Real-IP present and yandex configured", async () => {
    oauthMocks.getYandexOauthClientId.mockResolvedValue("test-client-id");
    oauthMocks.getYandexOauthClientSecret.mockResolvedValue("test-secret");
    oauthMocks.getYandexOauthRedirectUri.mockResolvedValue("http://localhost/api/auth/oauth/callback");

    const res = await POST(
      new Request("http://localhost/api/auth/oauth/start", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-real-ip": "198.51.100.1",
        },
        body: JSON.stringify({ provider: "yandex" }),
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; authUrl?: string };
    expect(data.ok).toBe(true);
    expect(data.authUrl).toContain("https://oauth.yandex.ru/authorize");
  });
});
