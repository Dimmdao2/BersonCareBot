import { describe, expect, it, vi, beforeEach } from "vitest";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const rateLimitMock = vi.hoisted(() => vi.fn());
const startBindMock = vi.hoisted(() => vi.fn());
const getTelegramLoginBotUsernameMock = vi.hoisted(() => vi.fn());
const getMaxLoginBotNicknameMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/system-settings/telegramLoginBotUsername", () => ({
  getTelegramLoginBotUsername: () => getTelegramLoginBotUsernameMock(),
}));

vi.mock("@/modules/system-settings/maxLoginBotNickname", () => ({
  getMaxLoginBotNickname: () => getMaxLoginBotNicknameMock(),
}));

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: (...args: unknown[]) => getCurrentSessionMock(...args),
}));

vi.mock("@/modules/auth/phoneMessengerBindStartRateLimit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/auth/phoneMessengerBindStartRateLimit")>();
  return {
    ...actual,
    isPhoneMessengerBindStartRateLimited: (...args: unknown[]) => rateLimitMock(...args),
  };
});

const findByPhoneMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    userByPhone: { findByPhone: (...args: unknown[]) => findByPhoneMock(...args) },
    phoneMessengerBind: { start: (...args: unknown[]) => startBindMock(...args) },
  }),
}));

import { POST } from "./route";

describe("POST /api/auth/phone/messenger-bind/start", () => {
  beforeEach(() => {
    getCurrentSessionMock.mockReset();
    rateLimitMock.mockReset();
    startBindMock.mockReset();
    findByPhoneMock.mockReset();
    getTelegramLoginBotUsernameMock.mockReset();
    getMaxLoginBotNicknameMock.mockReset();
    getTelegramLoginBotUsernameMock.mockResolvedValue("test_bot");
    getMaxLoginBotNicknameMock.mockResolvedValue("");
    rateLimitMock.mockResolvedValue(false);
    getCurrentSessionMock.mockResolvedValue(null);
    findByPhoneMock.mockResolvedValue(null);
    startBindMock.mockResolvedValue({
      ok: true as const,
      setupToken: "auth_test",
      url: "https://t.me/test_bot?start=auth_test",
      expiresAtIso: "2026-01-01T00:00:00.000Z",
    });
  });

  it("returns 400 for invalid body", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/phone/messenger-bind/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "" }),
      }),
    );
    expect(res.status).toBe(400);
    expect(startBindMock).not.toHaveBeenCalled();
  });

  it("returns 401 for profile_bind without session", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/phone/messenger-bind/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phone: "+79001234567",
          channelCode: "telegram",
          purpose: "profile_bind",
        }),
      }),
    );
    expect(res.status).toBe(401);
    expect(startBindMock).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limited", async () => {
    rateLimitMock.mockResolvedValue(true);
    const res = await POST(
      new Request("http://localhost/api/auth/phone/messenger-bind/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phone: "+79001234567",
          channelCode: "telegram",
          purpose: "login",
        }),
      }),
    );
    expect(res.status).toBe(429);
    const data = (await res.json()) as { error?: string };
    expect(data.error).toBe("rate_limited");
  });

  it("returns 200 for profile_bind with patient session", async () => {
    getCurrentSessionMock.mockResolvedValue({
      user: { userId: "user-1", role: "client", bindings: {} },
    });
    const res = await POST(
      new Request("http://localhost/api/auth/phone/messenger-bind/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phone: "+79001234567",
          channelCode: "max",
          purpose: "profile_bind",
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(startBindMock).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "profile_bind", sessionUserId: "user-1" }),
    );
  });

  it("returns 200 for login without session", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/phone/messenger-bind/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phone: "+79001234567",
          channelCode: "telegram",
          purpose: "login",
        }),
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok?: boolean; setupToken?: string; url?: string };
    expect(data.ok).toBe(true);
    expect(data.setupToken).toBe("auth_test");
    expect(startBindMock).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "login", channelCode: "telegram" }),
    );
  });
});
