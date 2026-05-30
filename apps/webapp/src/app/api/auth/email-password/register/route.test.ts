import { describe, expect, it, vi, beforeEach } from "vitest";

const registerPending = vi.fn();
const deleteUnverified = vi.fn();
const tryResend = vi.fn();
const resolveAuthState = vi.fn();
const requestContactEmailSetup = vi.fn();

const recordAuthRegistrationAttemptMock = vi.fn(async (_params: unknown) => undefined);
const recordAuthRegistrationFailureMock = vi.fn(async (_params: unknown) => undefined);
const recordAuthRegistrationSuccessMock = vi.fn(async (_params: unknown) => undefined);

vi.mock("@/app-layer/product-analytics/recordAuthRegistration", () => ({
  newRegistrationAttemptId: () => "11111111-1111-4111-8111-111111111111",
  recordAuthRegistrationAttempt: (params: unknown) => recordAuthRegistrationAttemptMock(params),
  recordAuthRegistrationFailure: (params: unknown) => recordAuthRegistrationFailureMock(params),
  recordAuthRegistrationSuccess: (params: unknown) => recordAuthRegistrationSuccessMock(params),
}));

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
    recordAuthRegistrationAttemptMock.mockReset();
    recordAuthRegistrationFailureMock.mockReset();
    recordAuthRegistrationSuccessMock.mockReset();
  });

  it("records registration attempt and success when challenge is sent", async () => {
    registerPending.mockResolvedValueOnce({ ok: true, userId: "11111111-1111-1111-1111-111111111111" });
    startEmailChallenge.mockResolvedValueOnce({
      ok: true,
      challengeId: "chal-1",
      retryAfterSeconds: 60,
    });

    const res = await POST(
      new Request("http://localhost/api/auth/email-password/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "new@example.com", password: "password12", displayName: "New" }),
      }),
    );

    expect(res.status).toBe(200);
    expect(recordAuthRegistrationAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({ authMethod: "email_password", stage: "start" }),
    );
    expect(recordAuthRegistrationSuccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "challenge_sent", challengeId: "chal-1" }),
    );
    const body = (await res.json()) as { attemptId?: string };
    expect(body.attemptId).toBe("11111111-1111-4111-8111-111111111111");
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

  it("returns existing_account_needs_email_setup with code challenge for contact-only duplicate", async () => {
    registerPending.mockResolvedValueOnce({ ok: false, reason: "duplicate_email" });
    resolveAuthState.mockResolvedValueOnce({
      kind: "needs_email_setup",
      userId: "22222222-2222-2222-2222-222222222222",
    });
    startEmailChallenge.mockResolvedValueOnce({
      ok: true,
      challengeId: "setup-chal-1",
      retryAfterSeconds: 60,
    });

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
    const body = (await res.json()) as { ok?: boolean; error?: string; setupCodeSent?: boolean };
    expect(body).toEqual(
      expect.objectContaining({
        ok: true,
        error: "existing_account_needs_email_setup",
        setupCodeSent: true,
        challengeId: "setup-chal-1",
        attemptId: expect.any(String),
      }),
    );
    expect(startEmailChallenge).toHaveBeenCalledWith(
      "22222222-2222-2222-2222-222222222222",
      "patient@example.com",
    );
    expect(requestContactEmailSetup).not.toHaveBeenCalled();
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
