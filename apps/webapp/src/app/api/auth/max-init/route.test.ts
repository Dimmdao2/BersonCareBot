import { describe, expect, it, vi } from "vitest";

const exchangeMaxInitDataMock = vi.fn();

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
      exchangeMaxInitData: exchangeMaxInitDataMock,
    },
    systemSettings: {
      getSetting: vi.fn().mockResolvedValue(null),
    },
  }),
}));

import { logger } from "@/app-layer/logging/logger";
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

  it("logs miniappAuthOutcome invalid_body on 400", async () => {
    await POST(
      new Request("http://localhost/api/auth/max-init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "auth/max-init",
        miniappAuthOutcome: "invalid_body",
      }),
      expect.stringContaining("MAX Mini App"),
    );
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
    const json = (await res.json()) as { error?: string; denyReason?: string };
    expect(json.error).toBe("access_denied");
    expect(json.denyReason).toBe("signature_mismatch");
  });

  it("returns max_unavailable when bot API key is missing in settings", async () => {
    exchangeMaxInitDataMock.mockResolvedValueOnce({ denied: true, reason: "max_bot_api_key_missing" });
    const res = await POST(
      new Request("http://localhost/api/auth/max-init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: "any" }),
      }),
    );
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error?: string; denyReason?: string };
    expect(json.error).toBe("max_unavailable");
    expect(json.denyReason).toBe("max_bot_api_key_missing");
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
