import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentSessionMock = vi.fn();
const sendEmailCodeViaIntegratorMock = vi.fn();
const isAuthChannelEnabledMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/authChannelPolicy", () => ({
  AUTH_CHANNEL_DISABLED_ERROR: "auth_channel_disabled",
  isAuthChannelEnabled: (...args: unknown[]) => isAuthChannelEnabledMock(...args),
}));

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: (...args: unknown[]) => getCurrentSessionMock(...args),
}));

vi.mock("@/infra/integrations/email/integratorEmailAdapter", () => ({
  sendEmailCodeViaIntegrator: (...args: unknown[]) => sendEmailCodeViaIntegratorMock(...args),
}));

import { POST } from "./route";

describe("POST /api/auth/email/start", () => {
  beforeEach(() => {
    getCurrentSessionMock.mockReset();
    sendEmailCodeViaIntegratorMock.mockReset();
    isAuthChannelEnabledMock.mockReset();
    isAuthChannelEnabledMock.mockResolvedValue(true);
  });

  it("rejects a disabled email channel before session lookup or send", async () => {
    isAuthChannelEnabledMock.mockResolvedValue(false);
    const res = await POST(
      new Request("http://localhost/api/auth/email/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@example.com" }),
      }),
    );

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ ok: false, error: "auth_channel_disabled" });
    expect(getCurrentSessionMock).not.toHaveBeenCalled();
    expect(sendEmailCodeViaIntegratorMock).not.toHaveBeenCalled();
  });

  it("returns 401 when session is missing", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(null);
    const res = await POST(
      new Request("http://localhost/api/auth/email/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@example.com" }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 200 and creates challenge via integrator adapter", async () => {
    getCurrentSessionMock.mockResolvedValueOnce({
      user: { userId: "u-1", role: "client" },
    });
    sendEmailCodeViaIntegratorMock.mockResolvedValueOnce({ ok: true });

    const res = await POST(
      new Request("http://localhost/api/auth/email/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@example.com" }),
      })
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; challengeId?: string };
    expect(data.ok).toBe(true);
    expect(typeof data.challengeId).toBe("string");
    expect(sendEmailCodeViaIntegratorMock).toHaveBeenCalledTimes(1);
    expect(sendEmailCodeViaIntegratorMock).toHaveBeenCalledWith("user@example.com", expect.stringMatching(/^\d{6}$/));
  });

});
