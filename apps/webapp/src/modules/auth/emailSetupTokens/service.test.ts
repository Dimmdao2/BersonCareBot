import { describe, expect, it, vi, beforeEach } from "vitest";
import { EMAIL_SETUP_TOKEN_TTL_MS } from "./constants";
import { hashEmailSetupToken } from "./tokenCrypto";
import { createEmailSetupTokensService } from "./service";
import type { EmailSetupTokensPort } from "./ports";

type MockTokenEntry = {
  id: string;
  row: Parameters<EmailSetupTokensPort["insertToken"]>[0];
  used: boolean;
  revoked: boolean;
};

function createMockPort(): EmailSetupTokensPort {
  const store = new Map<string, MockTokenEntry>();

  return {
    revokeActiveForUserEmail: vi.fn(async (userId, emailNormalized) => {
      for (const [hash, entry] of store) {
        if (entry.row.userId === userId && entry.row.emailNormalized === emailNormalized && !entry.used && !entry.revoked) {
          entry.revoked = true;
          store.set(hash, entry);
        }
      }
    }),
    insertToken: vi.fn(async (params) => {
      const id = `tok-${store.size + 1}`;
      store.set(params.tokenHash, { row: { ...params }, id, used: false, revoked: false });
      return { id };
    }),
    deleteTokenById: vi.fn(async (id) => {
      for (const [hash, entry] of store) {
        if (entry.id === id) store.delete(hash);
      }
    }),
    findByTokenHash: vi.fn(async (tokenHash) => {
      const entry = store.get(tokenHash);
      if (!entry) return null;
      return {
        id: entry.id,
        userId: entry.row.userId,
        emailNormalized: entry.row.emailNormalized,
        expiresAt: entry.row.expiresAtIso,
        usedAt: entry.used ? new Date().toISOString() : null,
        revokedAt: entry.revoked ? new Date().toISOString() : null,
      };
    }),
    markUsedById: vi.fn(async (id) => {
      for (const [hash, entry] of store) {
        if (entry.id === id && !entry.used && !entry.revoked) {
          entry.used = true;
          store.set(hash, entry);
          return true;
        }
      }
      return false;
    }),
  };
}

describe("emailSetupTokens service", () => {
  let port: EmailSetupTokensPort;

  beforeEach(() => {
    port = createMockPort();
  });

  it("issues token with 24h TTL and revokes previous active for user+email", async () => {
    const svc = createEmailSetupTokensService(port);
    const first = await svc.issueEmailSetupToken({
      userId: "u1",
      emailNormalized: "a@b.com",
      source: "doctor_profile",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await svc.issueEmailSetupToken({
      userId: "u1",
      emailNormalized: "a@b.com",
      source: "rubitime",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(port.revokeActiveForUserEmail).toHaveBeenCalledTimes(2);

    const firstHash = hashEmailSetupToken(first.tokenPlain);
    const firstRow = await port.findByTokenHash(firstHash);
    expect(firstRow?.revokedAt).toBeTruthy();

    const ttlMs =
      new Date((await port.findByTokenHash(hashEmailSetupToken(second.tokenPlain)))!.expiresAt).getTime() -
      Date.now();
    expect(ttlMs).toBeGreaterThan(EMAIL_SETUP_TOKEN_TTL_MS - 60_000);
    expect(ttlMs).toBeLessThanOrEqual(EMAIL_SETUP_TOKEN_TTL_MS);
  });

  it("validate rejects expired, used, and reused consume", async () => {
    const svc = createEmailSetupTokensService(port);
    const issued = await svc.issueEmailSetupToken({
      userId: "u1",
      emailNormalized: "a@b.com",
      source: "manual_resend",
    });
    if (!issued.ok) throw new Error("issue failed");

    const ok = await svc.validateEmailSetupToken(issued.tokenPlain);
    expect(ok).toMatchObject({ ok: true, userId: "u1", emailNormalized: "a@b.com" });

    const consumed = await svc.consumeEmailSetupToken(issued.tokenPlain);
    expect(consumed.ok).toBe(true);

    const again = await svc.validateEmailSetupToken(issued.tokenPlain);
    expect(again).toEqual({ ok: false, reason: "used" });
  });

  it("validate returns expired for past expires_at", async () => {
    const svc = createEmailSetupTokensService(port);
    const issued = await svc.issueEmailSetupToken({
      userId: "u1",
      emailNormalized: "a@b.com",
      source: "registration_claim",
    });
    if (!issued.ok) throw new Error("issue failed");

    const hash = hashEmailSetupToken(issued.tokenPlain);
    const row = await port.findByTokenHash(hash);
    if (!row) throw new Error("missing row");

    vi.spyOn(port, "findByTokenHash").mockResolvedValueOnce({
      ...row,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    const r = await svc.validateEmailSetupToken(issued.tokenPlain);
    expect(r).toEqual({ ok: false, reason: "expired" });
  });

  it("stores only hash in port insert (not plain token)", async () => {
    const svc = createEmailSetupTokensService(port);
    const issued = await svc.issueEmailSetupToken({
      userId: "u1",
      emailNormalized: "a@b.com",
      source: "doctor_profile",
    });
    if (!issued.ok) throw new Error("issue failed");

    const insertCall = vi.mocked(port.insertToken).mock.calls[0]?.[0];
    expect(insertCall?.tokenHash).toBe(hashEmailSetupToken(issued.tokenPlain));
    expect(insertCall?.tokenHash).not.toContain(issued.tokenPlain);
  });
});
