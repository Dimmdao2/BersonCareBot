import { describe, expect, it, vi } from "vitest";

const { findByPhoneMock, createPendingMock, rateLimitMock, tokenFactoryMock, hashTokenMock } = vi.hoisted(() => ({
  findByPhoneMock: vi.fn(),
  createPendingMock: vi.fn(),
  rateLimitMock: vi.fn(),
  tokenFactoryMock: vi.fn(),
  hashTokenMock: vi.fn(),
}));

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

import { POST } from "./route";

describe("POST /api/auth/messenger/start", () => {
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
    expect(json.deepLink).toContain("start=plain-token");
    expect("token" in json).toBe(false);
  });
});
