import { describe, expect, it, vi, beforeEach } from "vitest";

const registerPending = vi.fn();
const deleteUnverified = vi.fn();
const tryResend = vi.fn();
const resolveAuthState = vi.fn();
const requestContactEmailSetup = vi.fn();

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    userPasswordCredentials: {
      registerPendingVerification: registerPending,
      deleteUnverifiedEmailPasswordRegistration: deleteUnverified,
      tryResendRegistrationChallenge: tryResend,
      findUserIdByEmailChallengeId: vi.fn(),
    },
    emailPasswordLookup: {
      resolveAuthState,
    },
    emailSetupAccess: {
      requestContactEmailSetup,
    },
  }),
}));

vi.mock("@/modules/auth/pinHash", () => ({
  hashPin: async (p: string) => `hashed:${p}`,
}));

const startEmailChallenge = vi.fn();
vi.mock("@/modules/auth/emailAuth", async () => {
  const actual = await vi.importActual<typeof import("@/modules/auth/emailAuth")>("@/modules/auth/emailAuth");
  return {
    ...actual,
    startEmailChallenge: (...args: unknown[]) => startEmailChallenge(...args),
  };
});

import { POST } from "./route";

describe("POST /api/auth/email-password/register", () => {
  beforeEach(() => {
    registerPending.mockReset();
    deleteUnverified.mockReset();
    startEmailChallenge.mockReset();
    tryResend.mockReset();
    resolveAuthState.mockReset();
    requestContactEmailSetup.mockReset();
  });

  it("deletes unverified user when email challenge fails so retry is possible", async () => {
    registerPending.mockResolvedValueOnce({ ok: true, userId: "11111111-1111-1111-1111-111111111111" });
    startEmailChallenge.mockResolvedValueOnce({ ok: false, code: "email_send_failed" });

    const res = await POST(
      new Request("http://localhost/api/auth/email-password/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "new@example.com", password: "password12" }),
      }),
    );

    expect(deleteUnverified).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok?: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("email_send_failed");
  });

  it("returns existing_account_needs_email_setup and sends setup link for contact-only duplicate", async () => {
    registerPending.mockResolvedValueOnce({ ok: false, reason: "duplicate_email" });
    resolveAuthState.mockResolvedValueOnce({
      kind: "needs_email_setup",
      userId: "22222222-2222-2222-2222-222222222222",
    });
    requestContactEmailSetup.mockResolvedValueOnce({ ok: true, status: "enqueued" });

    const res = await POST(
      new Request("http://localhost/api/auth/email-password/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "patient@example.com",
          password: "password12",
          displayName: "Patient",
        }),
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean; error?: string; setupLinkSent?: boolean };
    expect(body).toEqual({
      ok: true,
      error: "existing_account_needs_email_setup",
      setupLinkSent: true,
    });
    expect(requestContactEmailSetup).toHaveBeenCalledWith({
      userId: "22222222-2222-2222-2222-222222222222",
      emailNormalized: "patient@example.com",
      source: "registration_claim",
    });
    expect(tryResend).not.toHaveBeenCalled();
  });

  it("still resends registration challenge for pending_registration duplicate", async () => {
    registerPending.mockResolvedValueOnce({ ok: false, reason: "duplicate_email" });
    resolveAuthState.mockResolvedValueOnce({
      kind: "pending_registration",
      userId: "33333333-3333-3333-3333-333333333333",
    });
    tryResend.mockResolvedValueOnce({ ok: true, userId: "33333333-3333-3333-3333-333333333333" });
    startEmailChallenge.mockResolvedValueOnce({
      ok: true,
      challengeId: "chal-1",
      retryAfterSeconds: 60,
    });

    const res = await POST(
      new Request("http://localhost/api/auth/email-password/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "pending@example.com",
          password: "password12",
          displayName: "Pending",
        }),
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean; challengeId?: string };
    expect(body.ok).toBe(true);
    expect(body.challengeId).toBe("chal-1");
    expect(tryResend).toHaveBeenCalled();
  });
});
