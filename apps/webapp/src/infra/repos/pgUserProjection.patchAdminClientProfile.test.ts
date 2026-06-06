import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";

const { mockGetPool, mockTrustedAnchor, runWebappPgTextMock } = vi.hoisted(() => ({
  mockGetPool: vi.fn(),
  mockTrustedAnchor: vi.fn(),
  runWebappPgTextMock: vi.fn(),
}));

vi.mock("@/infra/db/client", () => ({
  getPool: mockGetPool,
}));

vi.mock("@/infra/db/runWebappSql", () => ({
  getWebappSqlFromPgClient: (client: unknown) => client,
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
}));

vi.mock("@/infra/repos/pgPhoneHistory", () => ({
  applyPlatformUserPhoneHistoryTransition: vi.fn(),
}));

vi.mock("@/modules/platform-access/trustedPhonePolicy", () => ({
  TrustedPatientPhoneSource: { AdminManualProfilePatch: "admin_patch" },
  trustedPatientPhoneWriteAnchor: mockTrustedAnchor,
}));

import { pgUserProjectionPort } from "./pgUserProjection";

function installPool(queryImpl: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>) {
  runWebappPgTextMock.mockImplementation(async (queryText: string, values?: readonly unknown[]) =>
    queryImpl(queryText, values as unknown[] | undefined),
  );
  const queryFn = vi.fn(async (sql: unknown, params?: unknown[]) => {
    if (typeof sql !== "string") return { rows: [], rowCount: 0 };
    return queryImpl(sql, params);
  });
  const client = {
    query: queryFn,
    release: vi.fn(),
  } as unknown as PoolClient;
  mockGetPool.mockReturnValue({
    query: queryFn,
    connect: vi.fn(async () => client),
  });
  return client;
}

describe("patchAdminClientProfile (PHASE_02 contact email)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears email_verified_at when doctor sets a new email and does not touch password credentials", async () => {
    const sqlLog: string[] = [];
    installPool(async (sql) => {
      sqlLog.push(sql);
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
      if (sql.includes("UPDATE platform_users SET")) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    const result = await pgUserProjectionPort.patchAdminClientProfile({
      platformUserId: "client-1",
      patch: { email: "new@example.com" },
    });

    expect(result).toEqual({ ok: true });
    const updateSql = sqlLog.find((s) => s.includes("UPDATE platform_users SET"));
    expect(updateSql).toContain("email_verified_at = CASE");
    expect(updateSql).toContain("THEN NULL");
    expect(sqlLog.some((s) => s.includes("user_password_credentials"))).toBe(false);
  });

  it("preserves email_verified_at when email value is unchanged", async () => {
    const sqlLog: string[] = [];
    installPool(async (sql) => {
      sqlLog.push(sql);
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
      if (sql.includes("UPDATE platform_users SET")) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    await pgUserProjectionPort.patchAdminClientProfile({
      platformUserId: "client-1",
      patch: { email: "same@example.com" },
    });

    const updateSql = sqlLog.find((s) => s.includes("UPDATE platform_users SET"))!;
    expect(updateSql).toContain("ELSE email_verified_at");
  });

  it("applyRubitimeEmailAutobind sets unverified contact email without password row", async () => {
    const sqlLog: string[] = [];
    runWebappPgTextMock.mockImplementation(async (queryText: string, values?: readonly unknown[]) => {
      sqlLog.push(queryText);
      if (queryText.includes("FROM platform_users") && queryText.includes("phone_normalized")) {
        return { rows: [{ id: "rubitime-user", email_verified_at: null }] };
      }
      if (queryText.includes("id <> $1 AND email")) return { rows: [] };
      if (queryText.includes("UPDATE platform_users SET email")) {
        expect(values).toEqual(["client@rubitime.test", "rubitime-user"]);
        return { rows: [], rowCount: 1 };
      }
      return { rows: [] };
    });

    const result = await pgUserProjectionPort.applyRubitimeEmailAutobind({
      phoneNormalized: "+79990001122",
      email: "client@rubitime.test",
    });

    expect(result).toEqual({ outcome: "applied", platformUserId: "rubitime-user" });
    const updateSql = sqlLog.find((s) => s.includes("email_verified_at = NULL"))!;
    expect(updateSql).toBeTruthy();
    expect(sqlLog.some((s) => s.includes("user_password_credentials"))).toBe(false);
  });
});
