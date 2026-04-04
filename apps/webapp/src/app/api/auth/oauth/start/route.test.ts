import { describe, expect, it, vi, beforeEach } from "vitest";

const yandexMocks = vi.hoisted(() => ({
  getYandexOauthClientId: vi.fn().mockResolvedValue(""),
  getYandexOauthClientSecret: vi.fn().mockResolvedValue(""),
  getYandexOauthRedirectUri: vi.fn().mockResolvedValue(""),
}));

vi.mock("@/modules/system-settings/integrationRuntime", async (importOriginal) => {
  const m = await importOriginal<typeof import("@/modules/system-settings/integrationRuntime")>();
  return {
    ...m,
    getYandexOauthClientId: yandexMocks.getYandexOauthClientId,
    getYandexOauthClientSecret: yandexMocks.getYandexOauthClientSecret,
    getYandexOauthRedirectUri: yandexMocks.getYandexOauthRedirectUri,
  };
});

import { POST } from "./route";

describe("POST /api/auth/oauth/start", () => {
  beforeEach(() => {
    yandexMocks.getYandexOauthClientId.mockResolvedValue("");
    yandexMocks.getYandexOauthClientSecret.mockResolvedValue("");
    yandexMocks.getYandexOauthRedirectUri.mockResolvedValue("");
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

  it("returns 501 for google (stub)", async () => {
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

  it("returns 501 for apple (stub)", async () => {
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

  it("returns 200 with authUrl when yandex credentials are present in system_settings (via integrationRuntime)", async () => {
    yandexMocks.getYandexOauthClientId.mockResolvedValue("test-client-id");
    yandexMocks.getYandexOauthClientSecret.mockResolvedValue("test-secret");
    yandexMocks.getYandexOauthRedirectUri.mockResolvedValue("http://localhost/api/auth/oauth/callback");

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
  });
});
