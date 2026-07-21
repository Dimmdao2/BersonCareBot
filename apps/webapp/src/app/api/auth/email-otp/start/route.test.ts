import { describe, expect, it, vi, beforeEach } from "vitest";

const startPublicEmailOtpChallengeMock = vi.fn();
const isAuthChannelEnabledMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/authChannelPolicy", () => ({
  AUTH_CHANNEL_DISABLED_ERROR: "auth_channel_disabled",
  isAuthChannelEnabled: (...args: unknown[]) => isAuthChannelEnabledMock(...args),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    emailOtpPublicDb: {},
  }),
}));

vi.mock("@/modules/auth/emailOtpPublic", () => ({
  startPublicEmailOtpChallenge: (...args: unknown[]) => startPublicEmailOtpChallengeMock(...args),
}));

import { POST } from "./route";
import * as authChannelPolicy from "@/modules/auth/authChannelPolicy";

/** Distinct X-Real-Ip per test so the per-IP limiter buckets don't couple tests. */
function makeStartRequest(body: unknown, ip: string): Request {
  return new Request("http://localhost/api/auth/email-otp/start", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": ip },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/email-otp/start", () => {
  beforeEach(() => {
    startPublicEmailOtpChallengeMock.mockReset();
    isAuthChannelEnabledMock.mockReset();
    isAuthChannelEnabledMock.mockResolvedValue(true);
    startPublicEmailOtpChallengeMock.mockResolvedValue({
      ok: true as const,
      challengeId: "ch-test-123",
      retryAfterSeconds: 60,
    });
  });

  it("rejects a disabled email channel before rate limit or challenge work", async () => {
    const policy = vi.spyOn(authChannelPolicy, "isAuthChannelEnabled").mockResolvedValue(false);
    try {
      const res = await POST(makeStartRequest({ email: "known@example.com" }, "10.0.0.10"));

      expect(res.status).toBe(503);
      await expect(res.json()).resolves.toEqual({
        ok: false,
        error: "auth_channel_disabled",
      });
      expect(startPublicEmailOtpChallengeMock).not.toHaveBeenCalled();
    } finally {
      policy.mockRestore();
    }
  });

  it("returns 400 when email is missing", async () => {
    const res = await POST(makeStartRequest({}, "10.0.0.1"));
    expect(res.status).toBe(400);
    const data = await res.json() as Record<string, unknown>;
    expect(data.ok).toBe(false);
    expect(data.error).toBe("invalid_email");
  });

  it("rejects a disabled email channel before rate limiting or challenge creation", async () => {
    isAuthChannelEnabledMock.mockResolvedValue(false);

    const res = await POST(makeStartRequest({ email: "user@example.com" }, "10.0.0.10"));

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ ok: false, error: "auth_channel_disabled" });
    expect(startPublicEmailOtpChallengeMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid email format", async () => {
    startPublicEmailOtpChallengeMock.mockResolvedValueOnce({ ok: false, code: "invalid_email" });
    const res = await POST(makeStartRequest({ email: "not-an-email" }, "10.0.0.2"));
    expect(res.status).toBe(400);
    const data = await res.json() as Record<string, unknown>;
    expect(data.ok).toBe(false);
    expect(data.error).toBe("invalid_email");
  });

  it("returns 200 with challengeId for valid email", async () => {
    const res = await POST(makeStartRequest({ email: "user@example.com" }, "10.0.0.3"));
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(data.challengeId).toBe("ch-test-123");
    expect(data.retryAfterSeconds).toBe(60);
  });

  it("returns 429 when rate limited", async () => {
    startPublicEmailOtpChallengeMock.mockResolvedValueOnce({
      ok: false,
      code: "rate_limited",
      retryAfterSeconds: 45,
    });
    const res = await POST(makeStartRequest({ email: "user@example.com" }, "10.0.0.4"));
    expect(res.status).toBe(429);
    const data = await res.json() as Record<string, unknown>;
    expect(data.ok).toBe(false);
    expect(data.error).toBe("rate_limited");
    expect(data.retryAfterSeconds).toBe(45);
  });

  it("returns 503 when email send fails", async () => {
    startPublicEmailOtpChallengeMock.mockResolvedValueOnce({ ok: false, code: "email_send_failed" });
    const res = await POST(makeStartRequest({ email: "user@example.com" }, "10.0.0.5"));
    expect(res.status).toBe(503);
    const data = await res.json() as Record<string, unknown>;
    expect(data.ok).toBe(false);
    expect(data.error).toBe("email_send_failed");
  });

  it("anti-enumeration: response shape is same for unknown email as for known (both 200 ok:true)", async () => {
    // When start returns ok:true for both known and unknown email, the caller can't tell them apart
    const res = await POST(makeStartRequest({ email: "unknown-user@example.com" }, "10.0.0.6"));
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(data.challengeId).toBeDefined();
  });

  it("per-IP rate limit: 11th start from the same IP within a minute gets generic 429", async () => {
    const ip = "10.9.9.9";
    for (let i = 0; i < 10; i++) {
      const okRes = await POST(makeStartRequest({ email: `probe-${i}@example.com` }, ip));
      expect(okRes.status).toBe(200);
    }
    const res = await POST(makeStartRequest({ email: "probe-11@example.com" }, ip));
    expect(res.status).toBe(429);
    const data = await res.json() as Record<string, unknown>;
    expect(data.ok).toBe(false);
    expect(data.error).toBe("rate_limited");
    // Generic response: no enumeration signal about the email itself.
    expect(data.retryAfterSeconds).toBe(60);
    // The module was never consulted for the limited request.
    expect(startPublicEmailOtpChallengeMock).toHaveBeenCalledTimes(10);
  });

  it("per-IP rate limit does not leak across different IPs", async () => {
    const res = await POST(makeStartRequest({ email: "other-ip@example.com" }, "10.8.8.8"));
    expect(res.status).toBe(200);
  });
});
