import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  resolveAuthState,
  upsertPasswordHash,
  findByUserId,
  updateRole,
  confirmEmailChallenge,
  consumeLatestEmailChallengeCodeForUser,
  setSessionFromUser,
} = vi.hoisted(() => ({
  resolveAuthState: vi.fn(),
  upsertPasswordHash: vi.fn(),
  findByUserId: vi.fn(),
  updateRole: vi.fn(),
  confirmEmailChallenge: vi.fn(),
  consumeLatestEmailChallengeCodeForUser: vi.fn(),
  setSessionFromUser: vi.fn(),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    emailPasswordLookup: { resolveAuthState },
    userPasswordCredentials: { upsertPasswordHash },
    userByPhone: { findByUserId },
    userProjection: { updateRole },
  }),
}));

vi.mock("@/modules/auth/emailAuth", async () => {
  const actual = await vi.importActual<typeof import("@/modules/auth/emailAuth")>("@/modules/auth/emailAuth");
  return {
    ...actual,
    confirmEmailChallenge: (...args: unknown[]) => confirmEmailChallenge(...args),
    consumeLatestEmailChallengeCodeForUser: (...args: unknown[]) => consumeLatestEmailChallengeCodeForUser(...args),
  };
});

vi.mock("@/modules/auth/pinHash", () => ({
  hashPin: async (password: string) => `hashed:${password}`,
}));

vi.mock("@/modules/auth/service", () => ({
  setSessionFromUser,
}));

import { POST } from "./route";

describe("POST /api/auth/email-password/setup-code/complete", () => {
  beforeEach(() => {
    resolveAuthState.mockReset();
    upsertPasswordHash.mockReset();
    findByUserId.mockReset();
    updateRole.mockReset();
    confirmEmailChallenge.mockReset();
    consumeLatestEmailChallengeCodeForUser.mockReset();
    setSessionFromUser.mockReset();
  });

  it("verifies setup code, stores password, and creates session", async () => {
    resolveAuthState.mockResolvedValueOnce({
      kind: "needs_email_setup",
      userId: "550e8400-e29b-41d4-a716-446655440000",
    });
    confirmEmailChallenge.mockResolvedValueOnce({ ok: true });
    findByUserId.mockResolvedValueOnce({
      userId: "550e8400-e29b-41d4-a716-446655440000",
      role: "client",
      phone: null,
      bindings: { telegramId: null, maxId: null },
    });

    const res = await POST(
      new Request("http://localhost/api/auth/email-password/setup-code/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "Patient@Example.com",
          challengeId: "11111111-1111-4111-8111-111111111111",
          code: "123456",
          password: "secret1234",
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(confirmEmailChallenge).toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440000",
      "11111111-1111-4111-8111-111111111111",
      "123456",
    );
    expect(upsertPasswordHash).toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440000",
      "hashed:secret1234",
    );
    expect(setSessionFromUser).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual({ ok: true, redirectTo: "/app/patient", role: "client" });
  });

  it("can verify the latest active setup code when challengeId was lost", async () => {
    resolveAuthState.mockResolvedValueOnce({
      kind: "needs_email_setup",
      userId: "550e8400-e29b-41d4-a716-446655440000",
    });
    consumeLatestEmailChallengeCodeForUser.mockResolvedValueOnce({ ok: true });
    findByUserId.mockResolvedValueOnce({
      userId: "550e8400-e29b-41d4-a716-446655440000",
      role: "client",
      phone: null,
      bindings: { telegramId: null, maxId: null },
    });

    const res = await POST(
      new Request("http://localhost/api/auth/email-password/setup-code/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "patient@example.com",
          code: "123456",
          password: "secret1234",
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(confirmEmailChallenge).not.toHaveBeenCalled();
    expect(consumeLatestEmailChallengeCodeForUser).toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440000",
      "123456",
    );
    expect(upsertPasswordHash).toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440000",
      "hashed:secret1234",
    );
  });

  it("does not consume code for an account that already has login", async () => {
    resolveAuthState.mockResolvedValueOnce({ kind: "verified_with_password", userId: "u1" });

    const res = await POST(
      new Request("http://localhost/api/auth/email-password/setup-code/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "patient@example.com",
          challengeId: "11111111-1111-4111-8111-111111111111",
          code: "123456",
          password: "secret1234",
        }),
      }),
    );

    expect(res.status).toBe(409);
    expect(confirmEmailChallenge).not.toHaveBeenCalled();
  });
});
