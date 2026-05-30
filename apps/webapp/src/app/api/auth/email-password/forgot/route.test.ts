import { describe, expect, it, vi, beforeEach } from "vitest";

const findVerified = vi.fn();
const resolveAuthState = vi.fn();
const requestContactEmailSetup = vi.fn();

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    userPasswordCredentials: {
      findVerifiedUserIdWithPassword: findVerified,
    },
    emailPasswordLookup: {
      resolveAuthState,
    },
    emailSetupAccess: {
      requestContactEmailSetup,
    },
  }),
}));

const startEmailChallenge = vi.fn();

vi.mock("@/modules/auth/emailAuth", async () => {
  const actual = await vi.importActual<typeof import("@/modules/auth/emailAuth")>("@/modules/auth/emailAuth");
  return {
    ...actual,
    startEmailChallenge: (...args: unknown[]) => startEmailChallenge(...args),
  };
});

import { OTP_RESEND_COOLDOWN_SEC } from "@/modules/auth/otpConstants";
import { POST } from "./route";

describe("POST /api/auth/email-password/forgot", () => {
  beforeEach(() => {
    findVerified.mockReset();
    startEmailChallenge.mockReset();
    resolveAuthState.mockReset();
    requestContactEmailSetup.mockReset();
  });

  it("returns same response shape without challengeId for missing user and for successful send", async () => {
    findVerified.mockResolvedValueOnce(null);
    resolveAuthState.mockResolvedValueOnce({ kind: "free" });
    const r1 = await POST(
      new Request("http://localhost/api/auth/email-password/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "a@b.com" }),
      }),
    );
    expect(r1.status).toBe(200);
    const j1 = (await r1.json()) as Record<string, unknown>;
    expect(j1).toEqual({ ok: true, retryAfterSeconds: OTP_RESEND_COOLDOWN_SEC });
    expect(j1.challengeId).toBeUndefined();
    expect(requestContactEmailSetup).not.toHaveBeenCalled();

    findVerified.mockResolvedValueOnce("550e8400-e29b-41d4-a716-446655440000");
    startEmailChallenge.mockResolvedValueOnce({ ok: true, challengeId: "ch-id", retryAfterSeconds: 52 });
    const r2 = await POST(
      new Request("http://localhost/api/auth/email-password/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "real@b.com" }),
      }),
    );
    expect(r2.status).toBe(200);
    const j2 = (await r2.json()) as Record<string, unknown>;
    expect(j2).toEqual({ ok: true, retryAfterSeconds: OTP_RESEND_COOLDOWN_SEC });
    expect(j2.challengeId).toBeUndefined();
    expect(startEmailChallenge).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440000", "real@b.com");
  });

  it("sends setup code for contact-only email and returns challenge for current UI", async () => {
    findVerified.mockResolvedValueOnce(null);
    resolveAuthState.mockResolvedValueOnce({
      kind: "needs_email_setup",
      userId: "22222222-2222-2222-2222-222222222222",
    });
    startEmailChallenge.mockResolvedValueOnce({ ok: true, challengeId: "setup-ch-1", retryAfterSeconds: 44 });

    const r = await POST(
      new Request("http://localhost/api/auth/email-password/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "contact@example.com" }),
      }),
    );

    expect(r.status).toBe(200);
    const j = (await r.json()) as Record<string, unknown>;
    expect(j).toEqual({ ok: true, challengeId: "setup-ch-1", retryAfterSeconds: 44, setupRequired: true });
    expect(startEmailChallenge).toHaveBeenCalledWith("22222222-2222-2222-2222-222222222222", "contact@example.com");
    expect(requestContactEmailSetup).not.toHaveBeenCalled();
  });

  it("returns neutral 200 when startEmailChallenge fails (no enumeration)", async () => {
    findVerified.mockResolvedValueOnce("550e8400-e29b-41d4-a716-446655440000");
    startEmailChallenge.mockResolvedValueOnce({ ok: false, code: "email_send_failed" });
    const r = await POST(
      new Request("http://localhost/api/auth/email-password/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "x@y.com" }),
      }),
    );
    expect(r.status).toBe(200);
    const j = (await r.json()) as Record<string, unknown>;
    expect(j).toEqual({ ok: true, retryAfterSeconds: OTP_RESEND_COOLDOWN_SEC });
  });
});
