import { describe, expect, it, vi } from "vitest";
import { PLATFORM_COOKIE_NAME } from "@/shared/lib/platform";

const exchangeIntegratorTokenMock = vi.fn();

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    auth: {
      exchangeIntegratorToken: exchangeIntegratorTokenMock,
    },
  }),
}));

import { POST } from "./route";

describe("POST /api/auth/exchange", () => {
  it("returns 400 for invalid payload", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/exchange", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when token is denied", async () => {
    exchangeIntegratorTokenMock.mockResolvedValueOnce(null);
    const res = await POST(
      new Request("http://localhost/api/auth/exchange", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "bad-token" }),
      })
    );
    expect(res.status).toBe(403);
  });

  it("returns 200 with role and redirect", async () => {
    exchangeIntegratorTokenMock.mockResolvedValueOnce({
      session: {
        user: {
          userId: "u1",
          role: "doctor",
          displayName: "Doctor",
          bindings: {},
        },
        issuedAt: 1,
        expiresAt: 2,
      },
      redirectTo: "/app/doctor",
    });
    const res = await POST(
      new Request("http://localhost/api/auth/exchange", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "ok-token" }),
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; role: string; redirectTo: string };
    expect(data).toEqual({
      ok: true,
      role: "doctor",
      redirectTo: "/app/doctor",
    });
  });

  it("sets bot platform cookie for messenger exchange", async () => {
    exchangeIntegratorTokenMock.mockResolvedValueOnce({
      session: {
        user: {
          userId: "u2",
          role: "client",
          displayName: "Client",
          bindings: { telegramId: "12345" },
        },
        issuedAt: 1,
        expiresAt: 2,
      },
      redirectTo: "/app/patient",
    });
    const res = await POST(
      new Request("http://localhost/api/auth/exchange", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "ok-token" }),
      })
    );
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${PLATFORM_COOKIE_NAME}=bot`);
  });
});
