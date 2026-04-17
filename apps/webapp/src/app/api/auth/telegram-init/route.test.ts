import { describe, expect, it, vi } from "vitest";
import { PLATFORM_COOKIE_NAME } from "@/shared/lib/platform";

const exchangeTelegramInitDataMock = vi.fn();

vi.mock("@/app-layer/logging/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    auth: {
      exchangeTelegramInitData: exchangeTelegramInitDataMock,
    },
    systemSettings: {
      getSetting: vi.fn().mockResolvedValue(null),
    },
  }),
}));

import { logger } from "@/app-layer/logging/logger";
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

  it("logs miniappAuthOutcome invalid_body on 400", async () => {
    await POST(
      new Request("http://localhost/api/auth/telegram-init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "auth/telegram-init",
        miniappAuthOutcome: "invalid_body",
      }),
      expect.stringContaining("Telegram Mini App"),
    );
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
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${PLATFORM_COOKIE_NAME}=bot`);
    expect(setCookie.toLowerCase()).not.toContain("httponly");
  });
});
