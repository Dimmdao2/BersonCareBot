import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentDbPrincipal } from "@bersoncare/db-principal";
import { MergeConflictError } from "@bersoncare/platform-merge";

const {
  runWebappPgTextMock,
  runWebappTransactionMock,
  mergePlatformUsersInTransactionMock,
  upsertOpenConflictLogMock,
} = vi.hoisted(() => ({
  runWebappPgTextMock: vi.fn(),
  runWebappTransactionMock: vi.fn(),
  mergePlatformUsersInTransactionMock: vi.fn(),
  upsertOpenConflictLogMock: vi.fn(),
}));

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
  runWebappTransaction: (...args: unknown[]) => runWebappTransactionMock(...args),
}));

vi.mock("@bersoncare/platform-merge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@bersoncare/platform-merge")>();
  return {
    ...actual,
    mergePlatformUsersInTransaction: (...args: unknown[]) => mergePlatformUsersInTransactionMock(...args),
  };
});

vi.mock("@/infra/adminAuditLog", () => ({
  upsertOpenConflictLog: (...args: unknown[]) => upsertOpenConflictLogMock(...args),
}));

vi.mock("@/infra/db/client", () => ({
  getPool: vi.fn(() => ({ connect: vi.fn() })),
}));

import { pgEmailSetupFlowPort } from "./pgEmailSetupFlowPort";
import { createPgEmailPasswordLookupPort } from "./pgEmailPasswordLookup";
import { createPgUserPasswordCredentialsPort } from "./pgUserPasswordCredentials";
import { pgOAuthBindingsPort } from "./pgOAuthBindings";
import { pgLoginTokensPort } from "./pgLoginTokens";
import { createPgPhoneChallengeStore } from "./pgPhoneChallengeStore";
import { pgEmailSetupTokensPort } from "./pgEmailSetupTokens";
import { claimVerifiedEmail } from "./pgEmailAuth";

const __dirname = dirname(fileURLToPath(import.meta.url));

const AUTH_EMAIL_REPO_FILES = [
  "pgEmailSetupFlowPort.ts",
  "pgEmailPasswordLookup.ts",
  "pgUserPasswordCredentials.ts",
  "pgOAuthBindings.ts",
  "pgLoginTokens.ts",
  "pgPhoneChallengeStore.ts",
  "pgEmailSetupTokens.ts",
] as const;

describe("Wave3 phase 15B auth/email repos (runtime constraints)", () => {
  it.each(AUTH_EMAIL_REPO_FILES)("uses runWebappPgText — no pool.query / client.query in %s", (file) => {
    const src = readFileSync(join(__dirname, file), "utf8");
    expect(src).not.toMatch(/\bpool\.query\b/);
    expect(src).not.toMatch(/\bclient\.query\b/);
    expect(src).toContain("runWebappPgText");
  });

  it("pgEmailPasswordLookup keeps getPool only for Class C audit delegate", () => {
    const src = readFileSync(join(__dirname, "pgEmailPasswordLookup.ts"), "utf8");
    expect(src).toContain("getPool()");
    expect(src).toContain("upsertOpenConflictLog");
    expect(src).not.toMatch(/\bpool\.query\b/);
  });
});

describe("pgAuthEmailPorts (SQL parity)", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    runWebappTransactionMock.mockReset();
    mergePlatformUsersInTransactionMock.mockReset();
    upsertOpenConflictLogMock.mockReset();
    runWebappTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ rollback: vi.fn() }),
    );
    mergePlatformUsersInTransactionMock.mockResolvedValue(undefined);
    upsertOpenConflictLogMock.mockResolvedValue({ kind: "inserted" });
  });

  it("pgEmailSetupFlowPort assertContactEmailForSetup checks platform_users by id", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [
        {
          email: "user@example.com",
          email_normalized: "user@example.com",
          email_verified_at: null,
          has_password: false,
        },
      ],
    });
    const r = await pgEmailSetupFlowPort.assertContactEmailForSetup({
      userId: "550e8400-e29b-41d4-a716-446655440000",
      emailNormalized: "user@example.com",
    });
    expect(r).toEqual({ ok: true, email: "user@example.com" });
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain("FROM platform_users pu");
  });

  it("pgEmailSetupFlowPort applyEmailSetupCompletion runs transactional updates", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [{ id: "u1" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const r = await pgEmailSetupFlowPort.applyEmailSetupCompletion({
      userId: "550e8400-e29b-41d4-a716-446655440000",
      emailNormalized: "user@example.com",
      passwordHash: "hash",
      setupTokenId: "token-1",
    });
    expect(r).toEqual({ ok: true });
    expect(runWebappTransactionMock).toHaveBeenCalledTimes(1);
    const sqls = runWebappPgTextMock.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes("UPDATE platform_users") && s.includes("email_verified_at"))).toBe(true);
    expect(sqls.some((s) => s.includes("user_password_credentials"))).toBe(true);
    expect(sqls.some((s) => s.includes("user_email_setup_tokens"))).toBe(true);
  });

  it("pgLoginTokensPort findByTokenHash selects login_tokens by hash", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [
        {
          id: "lt-1",
          token_hash: "hash",
          user_id: "u1",
          method: "telegram",
          status: "pending",
          expires_at: "2026-06-06T12:00:00.000Z",
          confirmed_at: null,
          session_issued_at: null,
        },
      ],
    });
    const row = await pgLoginTokensPort.findByTokenHash("hash");
    expect(row?.userId).toBe("u1");
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain("FROM login_tokens");
  });

  it("pgLoginTokensPort confirmByTokenHash updates pending token", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const now = new Date("2026-06-06T12:00:00.000Z");
    const ok = await pgLoginTokensPort.confirmByTokenHash("hash", now);
    expect(ok).toBe(true);
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain("status = 'confirmed'");
  });

  it("pgOAuthBindingsPort findUserByOAuthId queries bindings", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ user_id: "u1" }] });
    const r = await pgOAuthBindingsPort.findUserByOAuthId("google", "gid");
    expect(r).toEqual({ userId: "u1" });
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain("user_oauth_bindings");
  });

  it("createPgPhoneChallengeStore set upserts phone_challenges", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const store = createPgPhoneChallengeStore();
    await store.set("ch-1", {
      phone: "+79001234567",
      expiresAt: 9999999999,
      profileBindUserId: "00000000-0000-4000-8000-000000000010",
      profileBindOrganizationId: "00000000-0000-4000-8000-000000000011",
    });
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain("INSERT INTO phone_challenges");
    const context = JSON.parse(String(runWebappPgTextMock.mock.calls[0]?.[1]?.[4])) as Record<string, unknown>;
    expect(context).toMatchObject({
      profileBindUserId: "00000000-0000-4000-8000-000000000010",
      profileBindOrganizationId: "00000000-0000-4000-8000-000000000011",
    });
  });

  it("pgEmailSetupTokensPort markUsedById updates active token row", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const ok = await pgEmailSetupTokensPort.markUsedById("t1");
    expect(ok).toBe(true);
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain("SET used_at = now()");
  });

  it("createPgUserPasswordCredentialsPort findUserIdByEmailChallengeId", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ user_id: "u1" }] });
    const port = createPgUserPasswordCredentialsPort();
    const uid = await port.findUserIdByEmailChallengeId("ch-1");
    expect(uid).toBe("u1");
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain(
      "app.email_password_find_user_id_by_email_challenge",
    );
  });

  it("createPgUserPasswordCredentialsPort uses the narrow login-candidate accessor for credential reads", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ id: "u1" }] });
    const port = createPgUserPasswordCredentialsPort();
    await expect(port.findVerifiedUserIdWithPassword("user@example.com")).resolves.toBe("u1");
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0]);
    expect(sql).toContain("app.email_password_find_login_candidate");
    expect(sql).not.toContain("FROM user_password_credentials");
  });

  it("createPgUserPasswordCredentialsPort registerPendingVerification uses runWebappTransaction", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{ ok: true, code: null, user_id: "u-new" }],
    });
    const port = createPgUserPasswordCredentialsPort();
    const r = await port.registerPendingVerification({
      emailNormalized: "user@example.com",
      passwordHash: "hash",
      lastName: "User",
      firstName: "One",
      patronymic: null,
    });
    expect(r).toEqual({ ok: true, userId: "u-new" });
    expect(runWebappTransactionMock).toHaveBeenCalledTimes(1);
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain("app.email_password_register_pending");
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual([
      "user@example.com",
      "hash",
      "User",
      "One",
      null,
      "client",
    ]);
  });

  it("createPgUserPasswordCredentialsPort registerPendingSpecialistVerification stores doctor role", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{ ok: true, code: null, user_id: "u-doctor" }],
    });
    const port = createPgUserPasswordCredentialsPort();
    const r = await port.registerPendingSpecialistVerification({
      emailNormalized: "doctor@example.com",
      passwordHash: "hash",
      lastName: "Doctor",
      firstName: "Owner",
      patronymic: "Middle",
    });
    expect(r).toEqual({ ok: true, userId: "u-doctor" });
    expect(runWebappTransactionMock).toHaveBeenCalledTimes(1);
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual([
      "doctor@example.com",
      "hash",
      "Doctor",
      "Owner",
      "Middle",
      "doctor",
    ]);
  });

  it("createPgEmailPasswordLookupPort resolveAuthState — verified_with_password", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{ id: "u1", email_verified: true, has_password: true }],
    });
    const port = createPgEmailPasswordLookupPort();
    const state = await port.resolveAuthState("user@example.com");
    expect(state).toEqual({ kind: "verified_with_password", userId: "u1" });
  });

  it("createPgEmailPasswordLookupPort resolveAuthState — free when no rows", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgEmailPasswordLookupPort();
    await expect(port.resolveAuthState("free@example.com")).resolves.toEqual({ kind: "free" });
  });

  it("createPgEmailPasswordLookupPort resolveAuthState — pending_registration", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{ id: "u1", email_verified: false, has_password: true }],
    });
    const port = createPgEmailPasswordLookupPort();
    await expect(port.resolveAuthState("pending@example.com")).resolves.toEqual({
      kind: "pending_registration",
      userId: "u1",
    });
  });

  it("createPgEmailPasswordLookupPort resolveAuthState — needs_email_setup", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{ id: "u1", email_verified: false, has_password: false }],
    });
    const port = createPgEmailPasswordLookupPort();
    await expect(port.resolveAuthState("setup@example.com")).resolves.toEqual({
      kind: "needs_email_setup",
      userId: "u1",
    });
  });

  it("createPgEmailPasswordLookupPort resolveAuthState — email_conflict on multiple password owners", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [
        { id: "u1", email_verified: true, has_password: true },
        { id: "u2", email_verified: false, has_password: true },
      ],
    });
    const port = createPgEmailPasswordLookupPort();
    const state = await port.resolveAuthState("conflict@example.com");
    expect(state).toEqual({ kind: "email_conflict", candidateIds: ["u1", "u2"] });
    expect(upsertOpenConflictLogMock).toHaveBeenCalledTimes(1);
    expect(runWebappTransactionMock).not.toHaveBeenCalled();
  });

  it("createPgEmailPasswordLookupPort resolveAuthState — auto-merge duplicate rows", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [
          { id: "u1", email_verified: true, has_password: false },
          { id: "u2", email_verified: false, has_password: false },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: "u1", email_verified: true, has_password: false }],
      });
    const port = createPgEmailPasswordLookupPort();
    const state = await port.resolveAuthState("merge@example.com");
    expect(state).toEqual({ kind: "needs_email_setup", userId: "u1" });
    expect(runWebappTransactionMock).toHaveBeenCalledTimes(1);
    expect(mergePlatformUsersInTransactionMock).toHaveBeenCalledWith(expect.anything(), "u1", "u2", "projection");
  });

  it("claimVerifiedEmail merges the sole password owner into the authenticated patient", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [{ conflict: true }] })
      .mockResolvedValueOnce({
        rows: [
          { id: "current", email_normalized: null, merged_into_id: null, role: "client" },
          { id: "owner", email_normalized: "taken@example.com", merged_into_id: null, role: "client" },
        ],
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    runWebappTransactionMock.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
      expect(getCurrentDbPrincipal()).toMatchObject({
        kind: "organization",
        organizationId: "00000000-0000-4000-8000-000000000001",
      });
      return fn({ rollback: vi.fn() });
    });

    await expect(claimVerifiedEmail("current", "Taken@Example.com", {
      profileBindOrganizationId: "00000000-0000-4000-8000-000000000001",
    })).resolves.toEqual({
      ok: true,
      merged: true,
    });
    expect(mergePlatformUsersInTransactionMock).toHaveBeenCalledWith(
      expect.anything(),
      "current",
      "owner",
      "email_bind",
    );
    expect(String(runWebappPgTextMock.mock.calls[2]?.[0])).toContain("app.email_auth_verify_user_email");
  });

  it("claimVerifiedEmail maps merge-engine password conflicts to email_conflict", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [{ conflict: true }] })
      .mockResolvedValueOnce({
        rows: [
          { id: "current", email_normalized: null, merged_into_id: null, role: "client" },
          { id: "owner", email_normalized: "taken@example.com", merged_into_id: null, role: "client" },
        ],
      });
    mergePlatformUsersInTransactionMock.mockRejectedValueOnce(
      new MergeConflictError(
        "merge: both users have password credentials",
        ["current", "owner"],
      ),
    );

    await expect(claimVerifiedEmail("current", "taken@example.com", {
      profileBindOrganizationId: "00000000-0000-4000-8000-000000000001",
    })).resolves.toEqual({
      ok: false,
      code: "email_conflict",
    });
    expect(mergePlatformUsersInTransactionMock).toHaveBeenCalledWith(
      expect.anything(),
      "current",
      "owner",
      "email_bind",
    );
  });
});
