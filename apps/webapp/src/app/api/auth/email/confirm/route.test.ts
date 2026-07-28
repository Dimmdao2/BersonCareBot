import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentSessionMock = vi.fn();
const confirmEmailChallengeMock = vi.fn();
const getCurrentDbPrincipalOrganizationIdMock = vi.fn();
const isAuthChannelEnabledMock = vi.hoisted(() => vi.fn());
const checkAuthConfirmRateLimitMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/di/bindAuthModulePorts", () => ({
  ensureAuthModulePortsBound: vi.fn(),
}));

vi.mock("@/modules/auth/authChannelPolicy", () => ({
  AUTH_CHANNEL_DISABLED_ERROR: "auth_channel_disabled",
  isAuthChannelEnabled: (...args: unknown[]) => isAuthChannelEnabledMock(...args),
}));

vi.mock("@/modules/auth/authConfirmRateLimit", () => ({
  AUTH_CONFIRM_RATE_LIMIT_SEC: 600,
  checkAuthConfirmRateLimit: (...args: unknown[]) => checkAuthConfirmRateLimitMock(...args),
}));

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: (...args: unknown[]) => getCurrentSessionMock(...args),
}));

vi.mock("@/modules/auth/emailAuth", () => ({
  confirmEmailChallenge: (...args: unknown[]) => confirmEmailChallengeMock(...args),
}));

vi.mock("@bersoncare/db-principal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bersoncare/db-principal")>()),
  getCurrentDbPrincipalOrganizationId: () => getCurrentDbPrincipalOrganizationIdMock(),
}));

import { POST } from "./route";
import * as authChannelPolicy from "@/modules/auth/authChannelPolicy";

describe("POST /api/auth/email/confirm", () => {
  beforeEach(() => {
    getCurrentSessionMock.mockReset();
    confirmEmailChallengeMock.mockReset();
    getCurrentDbPrincipalOrganizationIdMock.mockReset();
    isAuthChannelEnabledMock.mockReset();
    isAuthChannelEnabledMock.mockResolvedValue(true);
    checkAuthConfirmRateLimitMock.mockReset();
    checkAuthConfirmRateLimitMock.mockResolvedValue({ limited: false });
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue("00000000-0000-4000-8000-000000000001");
  });

  it("returns 429 rate_limited (same shape as too_many_attempts) when the per-IP limit trips, before checking the session", async () => {
    checkAuthConfirmRateLimitMock.mockResolvedValueOnce({ limited: true, reason: "rate_limited" });
    const res = await POST(
      new Request("http://localhost/api/auth/email/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId: "00000000-0000-4000-8000-000000000001", code: "123456" }),
      }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("600");
    const data = (await res.json()) as Record<string, unknown>;
    expect(data).toEqual({
      ok: false,
      error: "rate_limited",
      retryAfterSeconds: 600,
      message: expect.any(String),
    });
    expect(getCurrentSessionMock).not.toHaveBeenCalled();
    expect(confirmEmailChallengeMock).not.toHaveBeenCalled();
  });

  it("returns 503 proxy_configuration when the per-IP key cannot be resolved", async () => {
    checkAuthConfirmRateLimitMock.mockResolvedValueOnce({ limited: true, reason: "proxy_configuration" });
    const res = await POST(
      new Request("http://localhost/api/auth/email/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId: "00000000-0000-4000-8000-000000000001", code: "123456" }),
      }),
    );
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ ok: false, error: "proxy_configuration" });
    expect(confirmEmailChallengeMock).not.toHaveBeenCalled();
  });

  it("rejects a disabled email channel before session or challenge work", async () => {
    const policy = vi.spyOn(authChannelPolicy, "isAuthChannelEnabled").mockResolvedValue(false);
    try {
      const res = await POST(
        new Request("http://localhost/api/auth/email/confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            challengeId: "00000000-0000-4000-8000-000000000001",
            code: "123456",
          }),
        }),
      );

      expect(res.status).toBe(503);
      await expect(res.json()).resolves.toEqual({ ok: false, error: "auth_channel_disabled" });
      expect(getCurrentSessionMock).not.toHaveBeenCalled();
      expect(confirmEmailChallengeMock).not.toHaveBeenCalled();
    } finally {
      policy.mockRestore();
    }
  });

  it("returns 401 when session is missing", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(null);
    const res = await POST(
      new Request("http://localhost/api/auth/email/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId: "00000000-0000-4000-8000-000000000001", code: "123456" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 409 for email_conflict", async () => {
    getCurrentSessionMock.mockResolvedValueOnce({
      user: { userId: "u-1", role: "doctor" },
    });
    confirmEmailChallengeMock.mockResolvedValueOnce({ ok: false, code: "email_conflict" });

    const res = await POST(
      new Request("http://localhost/api/auth/email/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId: "00000000-0000-4000-8000-000000000001", code: "123456" }),
      }),
    );

    expect(res.status).toBe(409);
    const data = (await res.json()) as { ok: boolean; error: string; message: string };
    expect(data).toMatchObject({
      ok: false,
      error: "email_conflict",
      message: "Этот email уже используется другим аккаунтом",
    });
    expect(confirmEmailChallengeMock).toHaveBeenCalledWith(
      "u-1",
      "00000000-0000-4000-8000-000000000001",
      "123456",
      "email_verify",
      { profileBindOrganizationId: "00000000-0000-4000-8000-000000000001" },
    );
  });

  it("does not bind email when the channel is disabled", async () => {
    getCurrentSessionMock.mockResolvedValueOnce({
      user: { userId: "u-1", role: "doctor" },
    });
    isAuthChannelEnabledMock.mockResolvedValue(false);

    const res = await POST(
      new Request("http://localhost/api/auth/email/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId: "00000000-0000-4000-8000-000000000001",
          code: "123456",
        }),
      }),
    );

    expect(res.status).toBe(503);
    expect(confirmEmailChallengeMock).not.toHaveBeenCalled();
  });
});
