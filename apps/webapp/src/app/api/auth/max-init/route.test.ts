import { describe, expect, it, vi } from "vitest";

const exchangeMaxInitDataMock = vi.fn();

vi.mock("@/infra/logging/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    auth: {
      exchangeMaxInitData: exchangeMaxInitDataMock,
    },
  }),
}));

import { POST } from "./route";

describe("POST /api/auth/max-init", () => {
  it("returns 400 for invalid payload", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/max-init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when initData is denied", async () => {
    exchangeMaxInitDataMock.mockResolvedValueOnce({ denied: true, reason: "signature_mismatch" });
    const res = await POST(
      new Request("http://localhost/api/auth/max-init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: "bad" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 200 and sets platform cookie", async () => {
    exchangeMaxInitDataMock.mockResolvedValueOnce({
      session: {
        user: {
          userId: "u1",
          role: "client",
          displayName: "Client",
          bindings: { maxId: "207278131" },
        },
        issuedAt: 1,
        expiresAt: 2,
      },
      redirectTo: "/app/patient",
    });
    const res = await POST(
      new Request("http://localhost/api/auth/max-init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: "ok-init-data" }),
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; role: string; redirectTo: string };
    expect(data).toEqual({
      ok: true,
      role: "client",
      redirectTo: "/app/patient",
    });
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("bersoncare_platform=bot");
  });
});
