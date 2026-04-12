import { beforeEach, describe, expect, it, vi } from "vitest";

const { findByPhoneMock, createPendingMock, rateLimitMock, tokenFactoryMock, hashTokenMock, getTgBotMock } = vi.hoisted(
  () => ({
    findByPhoneMock: vi.fn(),
    createPendingMock: vi.fn(),
    rateLimitMock: vi.fn(),
    tokenFactoryMock: vi.fn(),
    hashTokenMock: vi.fn(),
    getTgBotMock: vi.fn(),
  }),
);

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    userByPhone: { findByPhone: findByPhoneMock },
    loginTokens: { createPending: createPendingMock },
  }),
}));

vi.mock("@/modules/auth/messengerStartRateLimit", () => ({
  isMessengerStartRateLimited: rateLimitMock,
}));

vi.mock("@/modules/auth/messengerLoginToken", () => ({
  createLoginTokenPlain: tokenFactoryMock,
  hashLoginTokenPlain: hashTokenMock,
}));

vi.mock("@/modules/system-settings/telegramLoginBotUsername", () => ({
  getTelegramLoginBotUsername: () => getTgBotMock(),
}));

import { POST } from "./route";

describe("POST /api/auth/messenger/start", () => {
  beforeEach(() => {
    getTgBotMock.mockReset();
    getTgBotMock.mockResolvedValue("bersoncare_bot");
  });

  it("returns 400 when phone is not valid E.164", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/messenger/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "bad", method: "telegram" }),
      })
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe("invalid_phone");
  });

  it("returns 400 on invalid body", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/messenger/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 429 on rate limit", async () => {
    rateLimitMock.mockReturnValueOnce(true);
    const res = await POST(
      new Request("http://localhost/api/auth/messenger/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "+79990000001", method: "telegram" }),
      })
    );
    expect(res.status).toBe(429);
  });

  it("returns deepLink without raw token field", async () => {
    rateLimitMock.mockReturnValueOnce(false);
    findByPhoneMock.mockResolvedValueOnce({ userId: "u1", role: "client" });
    tokenFactoryMock.mockReturnValueOnce("plain-token");
    hashTokenMock.mockReturnValueOnce("hashed-token");
    createPendingMock.mockResolvedValueOnce(undefined);

    const res = await POST(
      new Request("http://localhost/api/auth/messenger/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "+79990000001", method: "telegram" }),
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; deepLink: string | null; token?: string };
    expect(json.ok).toBe(true);
    expect(json.deepLink).toBe("https://t.me/bersoncare_bot?start=plain-token");
    expect("token" in json).toBe(false);
  });
});
