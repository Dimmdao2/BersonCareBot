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
  env: { SESSION_COOKIE_SECRET: "test-session-secret-16chars" },
}));

import { POST } from "./route";

describe("POST /api/auth/oauth/start", () => {
  beforeEach(() => {
    oauthMocks.getYandexOauthClientId.mockResolvedValue("");
    oauthMocks.getYandexOauthClientSecret.mockResolvedValue("");
    oauthMocks.getYandexOauthRedirectUri.mockResolvedValue("");
    oauthMocks.getGoogleClientId.mockResolvedValue("");
    oauthMocks.getGoogleClientSecret.mockResolvedValue("");
    oauthMocks.getGoogleOauthLoginRedirectUri.mockResolvedValue("");
    oauthMocks.getAppleOauthClientId.mockResolvedValue("");
    oauthMocks.getAppleOauthRedirectUri.mockResolvedValue("");
    oauthMocks.getAppleOauthTeamId.mockResolvedValue("");
    oauthMocks.getAppleOauthKeyId.mockResolvedValue("");
    oauthMocks.getAppleOauthPrivateKey.mockResolvedValue("");
  });

  it("returns 400 for missing body", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/oauth/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { ok: boolean; error: string };
    expect(data.ok).toBe(false);
    expect(data.error).toBe("invalid_body");
  });

  it("returns 501 for google when not configured", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/oauth/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "google" }),
      }),
    );
    expect(res.status).toBe(501);
    const data = (await res.json()) as { ok: boolean; error: string };
    expect(data.ok).toBe(false);
    expect(data.error).toBe("oauth_disabled");
  });

  it("returns 501 for apple when not configured", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/oauth/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "apple" }),
      }),
    );
    expect(res.status).toBe(501);
  });

  it("returns 501 for yandex when system_settings not configured (empty integration)", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/oauth/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "yandex" }),
      }),
    );
    expect(res.status).toBe(501);
    const data = (await res.json()) as { ok: boolean; error: string };
    expect(data.ok).toBe(false);
    expect(data.error).toBe("oauth_disabled");
  });

  it("returns 200 with authUrl when yandex credentials are present", async () => {
    oauthMocks.getYandexOauthClientId.mockResolvedValue("test-client-id");
    oauthMocks.getYandexOauthClientSecret.mockResolvedValue("test-secret");
    oauthMocks.getYandexOauthRedirectUri.mockResolvedValue("http://localhost/api/auth/oauth/callback");

    const res = await POST(
      new Request("http://localhost/api/auth/oauth/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "yandex" }),
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; authUrl?: string };
    expect(data.ok).toBe(true);
    expect(data.authUrl).toContain("https://oauth.yandex.ru/authorize");
    expect(data.authUrl).toContain("client_id=test-client-id");
    expect(data.authUrl).toContain("login%3Adefault_phone");
  });

  it("returns 200 with Google authorize URL when configured", async () => {
    oauthMocks.getGoogleClientId.mockResolvedValue("g-id");
    oauthMocks.getGoogleClientSecret.mockResolvedValue("g-sec");
    oauthMocks.getGoogleOauthLoginRedirectUri.mockResolvedValue("http://localhost/api/auth/oauth/callback/google");

    const res = await POST(
      new Request("http://localhost/api/auth/oauth/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "google" }),
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; authUrl?: string };
    expect(data.ok).toBe(true);
    expect(data.authUrl).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(data.authUrl).toContain("client_id=g-id");
    expect(data.authUrl).toContain("openid");
  });

  it("returns 200 with Apple authorize URL when configured", async () => {
    oauthMocks.getAppleOauthClientId.mockResolvedValue("com.example.siwa");
    oauthMocks.getAppleOauthRedirectUri.mockResolvedValue("http://localhost/api/auth/oauth/callback/apple");
    oauthMocks.getAppleOauthTeamId.mockResolvedValue("TEAM");
    oauthMocks.getAppleOauthKeyId.mockResolvedValue("KEY");
    oauthMocks.getAppleOauthPrivateKey.mockResolvedValue("-----BEGIN PRIVATE KEY-----\nMIGE...\n-----END PRIVATE KEY-----");

    const res = await POST(
      new Request("http://localhost/api/auth/oauth/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "apple" }),
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; authUrl?: string };
    expect(data.ok).toBe(true);
    expect(data.authUrl).toContain("https://appleid.apple.com/auth/authorize");
    expect(data.authUrl).toContain("response_mode=form_post");
    expect(data.authUrl).toContain("nonce=");
  });
});
