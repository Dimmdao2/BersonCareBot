import { describe, expect, it, vi, beforeEach } from "vitest";

const findVerified = vi.fn();
const updatePasswordHash = vi.fn();

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    userPasswordCredentials: {
      findVerifiedUserIdWithPassword: findVerified,
      updatePasswordHash,
    },
  }),
}));

const consumeById = vi.fn();
const consumeLatest = vi.fn();

vi.mock("@/modules/auth/emailAuth", async () => {
  const actual = await vi.importActual<typeof import("@/modules/auth/emailAuth")>("@/modules/auth/emailAuth");
  return {
    ...actual,
    consumeEmailChallengeCode: (...args: unknown[]) => consumeById(...args),
    consumeLatestEmailChallengeCodeForUser: (...args: unknown[]) => consumeLatest(...args),
  };
});

vi.mock("@/modules/auth/pinHash", () => ({
  hashPin: async (p: string) => `hashed:${p}`,
}));

import { POST } from "./route";

describe("POST /api/auth/email-password/reset", () => {
  beforeEach(() => {
    findVerified.mockReset();
    updatePasswordHash.mockReset();
    consumeById.mockReset();
    consumeLatest.mockReset();
  });

  it("verified user can reset without challengeId (forgot anti-enumeration path)", async () => {
    const uid = "550e8400-e29b-41d4-a716-446655440000";
    findVerified.mockResolvedValueOnce(uid);
    consumeLatest.mockResolvedValueOnce({ ok: true });
    updatePasswordHash.mockResolvedValueOnce(undefined);

    const res = await POST(
      new Request("http://localhost/api/auth/email-password/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "user@example.com",
          code: "123456",
          newPassword: "newsecret12",
        }),
      }),
    );

    expect(consumeLatest).toHaveBeenCalledWith(uid, "123456");
    expect(consumeById).not.toHaveBeenCalled();
    expect(updatePasswordHash).toHaveBeenCalledWith(uid, "hashed:newsecret12");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean };
    expect(body.ok).toBe(true);
  });

  it("uses consumeEmailChallengeCode when challengeId is provided", async () => {
    const uid = "550e8400-e29b-41d4-a716-446655440000";
    const ch = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    findVerified.mockResolvedValueOnce(uid);
    consumeById.mockResolvedValueOnce({ ok: true });
    updatePasswordHash.mockResolvedValueOnce(undefined);

    const res = await POST(
      new Request("http://localhost/api/auth/email-password/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "user@example.com",
          challengeId: ch,
          code: "999999",
          newPassword: "otherpass12",
        }),
      }),
    );

    expect(consumeById).toHaveBeenCalledWith(uid, ch, "999999");
    expect(consumeLatest).not.toHaveBeenCalled();
    expect(updatePasswordHash).toHaveBeenCalledWith(uid, "hashed:otherpass12");
    expect(res.status).toBe(200);
  });

  it("returns neutral invalid_code when email does not map to a verified password user", async () => {
    findVerified.mockResolvedValueOnce(null);
    consumeLatest.mockResolvedValueOnce({ ok: false, code: "expired_code" });

    const res = await POST(
      new Request("http://localhost/api/auth/email-password/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "nobody@example.com",
          code: "123456",
          newPassword: "newsecret12",
        }),
      }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok?: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("invalid_code");
    expect(consumeLatest).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000000", "123456");
    expect(consumeById).not.toHaveBeenCalled();
    expect(updatePasswordHash).not.toHaveBeenCalled();
  });

  it("runs dummy consume-by-id for missing user with challengeId", async () => {
    const ch = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    findVerified.mockResolvedValueOnce(null);
    consumeById.mockResolvedValueOnce({ ok: false, code: "expired_code" });

    const res = await POST(
      new Request("http://localhost/api/auth/email-password/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "nobody@example.com",
          challengeId: ch,
          code: "123456",
          newPassword: "newsecret12",
        }),
      }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok?: boolean; error?: string };
    expect(body).toEqual({ ok: false, error: "invalid_code" });
    expect(consumeById).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000000", ch, "123456");
    expect(consumeLatest).not.toHaveBeenCalled();
    expect(updatePasswordHash).not.toHaveBeenCalled();
  });

  it("returns same neutral failure shape for challenge consume errors", async () => {
    const uid = "550e8400-e29b-41d4-a716-446655440000";
    findVerified.mockResolvedValueOnce(uid);
    consumeLatest.mockResolvedValueOnce({ ok: false, code: "too_many_attempts", retryAfterSeconds: 90 });

    const res = await POST(
      new Request("http://localhost/api/auth/email-password/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "user@example.com",
          code: "000000",
          newPassword: "newsecret12",
        }),
      }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok?: boolean; error?: string; retryAfterSeconds?: number };
    expect(body).toEqual({ ok: false, error: "invalid_code" });
  });
});
