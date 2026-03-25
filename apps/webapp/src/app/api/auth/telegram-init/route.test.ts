import { describe, expect, it, vi } from "vitest";

const exchangeTelegramInitDataMock = vi.fn();

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    auth: {
      exchangeTelegramInitData: exchangeTelegramInitDataMock,
    },
  }),
}));

import { POST } from "./route";

describe("POST /api/auth/telegram-init", () => {
  it("returns 400 for invalid payload", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/telegram-init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when initData is denied", async () => {
    exchangeTelegramInitDataMock.mockResolvedValueOnce(null);
    const res = await POST(
      new Request("http://localhost/api/auth/telegram-init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: "bad-init-data" }),
      })
    );
    expect(res.status).toBe(403);
  });

  it("returns 200 with role and redirect", async () => {
    exchangeTelegramInitDataMock.mockResolvedValueOnce({
      session: {
        user: {
          userId: "u1",
          role: "client",
          displayName: "Client",
          bindings: { telegramId: "123" },
        },
        issuedAt: 1,
        expiresAt: 2,
      },
      redirectTo: "/app/patient",
    });
    const res = await POST(
      new Request("http://localhost/api/auth/telegram-init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: "ok-init-data" }),
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; role: string; redirectTo: string };
    expect(data).toEqual({
      ok: true,
      role: "client",
      redirectTo: "/app/patient",
    });
  });
});
