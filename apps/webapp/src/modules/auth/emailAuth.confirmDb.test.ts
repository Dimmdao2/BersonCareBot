import { createHash, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();

vi.mock("@/config/env", () => ({
  env: { DATABASE_URL: "postgres://test/db", SESSION_COOKIE_SECRET: "test-secret" },
  integratorWebhookSecret: () => "test-pepper",
}));

vi.mock("@/infra/integrations/email/integratorEmailAdapter", () => ({
  sendEmailCodeViaIntegrator: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/infra/db/client", () => ({
  getPool: () => ({ query: (...args: unknown[]) => queryMock(...args) }),
}));

import { confirmEmailChallenge } from "./emailAuth";

describe("confirmEmailChallenge (database)", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("возвращает email_conflict при занятом email в platform_users", async () => {
    const code = "123456";
    const codeHash = createHash("sha256").update(`${code}:test-pepper`).digest("hex");
    const userId = randomUUID();
    const challengeId = randomUUID();

    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM email_challenges WHERE id")) {
        return {
          rows: [
            {
              id: challengeId,
              email: "busy@example.org",
              code_hash: codeHash,
              expires_at: String(Math.floor(Date.now() / 1000) + 600),
              attempts: "0",
            },
          ],
        };
      }
      if (sql.includes("id <>") && sql.includes("email_normalized = lower")) {
        return { rows: [{ id: randomUUID() }] };
      }
      if (sql.includes("DELETE FROM email_challenges")) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [] };
    });

    const result = await confirmEmailChallenge(userId, challengeId, code);
    expect(result).toEqual({ ok: false, code: "email_conflict" });
  });

  it("возвращает email_conflict при unique violation на UPDATE", async () => {
    const code = "654321";
    const codeHash = createHash("sha256").update(`${code}:test-pepper`).digest("hex");
    const userId = randomUUID();
    const challengeId = randomUUID();

    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM email_challenges WHERE id")) {
        return {
          rows: [
            {
              id: challengeId,
              email: "race@example.org",
              code_hash: codeHash,
              expires_at: String(Math.floor(Date.now() / 1000) + 600),
              attempts: "0",
            },
          ],
        };
      }
      if (sql.includes("id <>") && sql.includes("email_normalized = lower")) {
        return { rows: [] };
      }
      if (sql.startsWith("UPDATE platform_users SET email")) {
        const err = new Error("duplicate") as Error & { code?: string };
        err.code = "23505";
        throw err;
      }
      if (sql.includes("DELETE FROM email_challenges")) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [] };
    });

    const result = await confirmEmailChallenge(userId, challengeId, code);
    expect(result).toEqual({ ok: false, code: "email_conflict" });
  });
});
