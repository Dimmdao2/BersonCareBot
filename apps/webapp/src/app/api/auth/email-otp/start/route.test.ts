import { describe, expect, it, vi, beforeEach } from "vitest";

const startPublicEmailOtpChallengeMock = vi.fn();

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    emailOtpPublicDb: {},
  }),
}));

vi.mock("@/modules/auth/emailOtpPublic", () => ({
  startPublicEmailOtpChallenge: (...args: unknown[]) => startPublicEmailOtpChallengeMock(...args),
}));

import { POST } from "./route";

describe("POST /api/auth/email-otp/start", () => {
  beforeEach(() => {
    startPublicEmailOtpChallengeMock.mockReset();
    startPublicEmailOtpChallengeMock.mockResolvedValue({
      ok: true as const,
      challengeId: "ch-test-123",
      retryAfterSeconds: 60,
    });
  });

  it("returns 400 when email is missing", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/email-otp/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
    const data = await res.json() as Record<string, unknown>;
    expect(data.ok).toBe(false);
    expect(data.error).toBe("invalid_email");
  });

  it("returns 400 for invalid email format", async () => {
    startPublicEmailOtpChallengeMock.mockResolvedValueOnce({ ok: false, code: "invalid_email" });
    const res = await POST(
      new Request("http://localhost/api/auth/email-otp/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "not-an-email" }),
      }),
    );
    expect(res.status).toBe(400);
    const data = await res.json() as Record<string, unknown>;
    expect(data.ok).toBe(false);
    expect(data.error).toBe("invalid_email");
  });

  it("returns 200 with challengeId for valid email", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/email-otp/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@example.com" }),
      }),
    );
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
    const res = await POST(
      new Request("http://localhost/api/auth/email-otp/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@example.com" }),
      }),
    );
    expect(res.status).toBe(429);
    const data = await res.json() as Record<string, unknown>;
    expect(data.ok).toBe(false);
    expect(data.error).toBe("rate_limited");
    expect(data.retryAfterSeconds).toBe(45);
  });

  it("returns 503 when email send fails", async () => {
    startPublicEmailOtpChallengeMock.mockResolvedValueOnce({ ok: false, code: "email_send_failed" });
    const res = await POST(
      new Request("http://localhost/api/auth/email-otp/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@example.com" }),
      }),
    );
    expect(res.status).toBe(503);
    const data = await res.json() as Record<string, unknown>;
    expect(data.ok).toBe(false);
    expect(data.error).toBe("email_send_failed");
  });

  it("anti-enumeration: response shape is same for unknown email as for known (both 200 ok:true)", async () => {
    // When start returns ok:true for both known and unknown email, the caller can't tell them apart
    const res = await POST(
      new Request("http://localhost/api/auth/email-otp/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "unknown-user@example.com" }),
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(data.challengeId).toBeDefined();
  });
});
