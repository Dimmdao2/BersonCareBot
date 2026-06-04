import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";

const { mockGetPool, mockTrustedAnchor } = vi.hoisted(() => ({
  mockGetPool: vi.fn(),
  mockTrustedAnchor: vi.fn(),
}));

vi.mock("@/infra/db/client", () => ({
  getPool: mockGetPool,
}));

vi.mock("@/infra/repos/pgPlatformUserMerge", () => ({
  mergePlatformUsersInTransaction: vi.fn(),
  pickMergeTargetId: vi.fn(),
  enrichPickMergeCandidatesWithBookingCounts: vi.fn(),
}));

vi.mock("@/modules/platform-access/trustedPhonePolicy", () => ({
  TrustedPatientPhoneSource: { IntegratorUpsertFromProjection: "integrator_upsert" },
  trustedPatientPhoneWriteAnchor: mockTrustedAnchor,
}));

import { pgUserProjectionPort } from "./pgUserProjection";

function installPool(queryImpl: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>) {
  const client = {
    query: vi.fn(queryImpl),
    release: vi.fn(),
  } as unknown as PoolClient;
  mockGetPool.mockReturnValue({
    connect: vi.fn(async () => client),
  });
  return client;
}

describe("ensureClientFromAppointmentProjection (Rubitime PHASE_01)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates client with trusted phone and unverified email when phone+email are new", async () => {
    const sqlLog: string[] = [];
    installPool(async (sql, params) => {
      sqlLog.push(sql);
      if (sql.includes("FROM platform_users WHERE phone_normalized")) return { rows: [] };
      if (sql.includes("INSERT INTO platform_users")) {
        expect(params).toEqual([
          "+79991234567",
          "Иван Иванов",
          "Иван",
          "Иванов",
          "ivan@example.com",
          null,
        ]);
        return { rows: [{ id: "new-user-1" }] };
      }
      return { rows: [] };
    });

    const result = await pgUserProjectionPort.ensureClientFromAppointmentProjection({
      phoneNormalized: "+79991234567",
      displayName: "Иван Иванов",
      firstName: "Иван",
      lastName: "Иванов",
      email: "ivan@example.com",
    });

    expect(result.platformUserId).toBe("new-user-1");
    expect(result.contactEmailSetup).toEqual({ emailNormalized: "ivan@example.com" });
    expect(sqlLog.some((s) => s.includes("patient_phone_trust_at"))).toBe(true);
    expect(sqlLog.some((s) => s.includes("email_normalized"))).toBe(true);
    expect(mockTrustedAnchor).toHaveBeenCalled();
  });

  it("finds existing user by phone and does not overwrite display_name", async () => {
    const sqlLog: string[] = [];
    installPool(async (sql) => {
      sqlLog.push(sql);
      if (sql.includes("FROM platform_users WHERE phone_normalized")) {
        return { rows: [{ id: "existing-phone-user" }] };
      }
      if (sql.includes("SELECT email_normalized FROM platform_users")) {
        return { rows: [{ email_normalized: "old@example.com" }] };
      }
      return { rows: [] };
    });

    const result = await pgUserProjectionPort.ensureClientFromAppointmentProjection({
      phoneNormalized: "+79990001122",
      displayName: "Rubitime Name",
      firstName: "X",
      lastName: "Y",
      email: "other@example.com",
    });

    expect(result.platformUserId).toBe("existing-phone-user");
    expect(result.contactEmailSetup).toEqual({ emailNormalized: "other@example.com" });
    const updateSql = sqlLog.find((s) => s.includes("UPDATE platform_users SET"));
    expect(updateSql).toBeTruthy();
    expect(updateSql).not.toContain("display_name =");
    expect(updateSql).toContain("patient_phone_trust_at");
  });

  it("finds user by email when phone misses and adds trusted Rubitime phone", async () => {
    const sqlLog: string[] = [];
    installPool(async (sql) => {
      sqlLog.push(sql);
      if (sql.includes("FROM platform_users WHERE phone_normalized")) return { rows: [] };
      if (sql.includes("email_normalized = lower")) return { rows: [{ id: "email-only-user" }] };
      return { rows: [] };
    });

    const result = await pgUserProjectionPort.ensureClientFromAppointmentProjection({
      phoneNormalized: "+79991112233",
      email: "known@example.com",
      displayName: "Ignored For Existing",
    });

    expect(result.platformUserId).toBe("email-only-user");
    const updateSql = sqlLog.find((s) => s.includes("UPDATE platform_users SET"));
    expect(updateSql).toContain("phone_normalized = COALESCE");
    expect(updateSql).toContain("patient_phone_trust_at");
  });

  it("skips email rewrite when normalized email is already used by another active user", async () => {
    installPool(async (sql, params) => {
      if (sql.includes("FROM platform_users WHERE phone_normalized")) {
        return { rows: [{ id: "existing-phone-user" }] };
      }
      if (sql.includes("SELECT email_normalized FROM platform_users")) {
        return { rows: [{ email_normalized: "old@example.com" }] };
      }
      if (sql.includes("email_normalized = $2::text")) {
        expect(params).toEqual(["existing-phone-user", "taken@example.com"]);
        return { rows: [{ id: "another-user" }] };
      }
      if (sql.includes("UPDATE platform_users SET")) {
        expect(params).toEqual([
          "existing-phone-user",
          null,
          null,
          "+79992223344",
        ]);
      }
      return { rows: [] };
    });

    const result = await pgUserProjectionPort.ensureClientFromAppointmentProjection({
      phoneNormalized: "+79992223344",
      email: "taken@example.com",
      displayName: "Ignored For Existing",
    });

    expect(result.platformUserId).toBe("existing-phone-user");
    expect(result.contactEmailSetup).toBeUndefined();
  });

  it("retries without email when update hits active-email unique race", async () => {
    let updateCalls = 0;
    installPool(async (sql, params) => {
      if (sql.includes("FROM platform_users WHERE phone_normalized")) {
        return { rows: [{ id: "existing-phone-user" }] };
      }
      if (sql.includes("SELECT email_normalized FROM platform_users")) {
        return { rows: [{ email_normalized: "old@example.com" }] };
      }
      if (sql.includes("email_normalized = $2::text")) {
        return { rows: [] };
      }
      if (sql.includes("UPDATE platform_users SET")) {
        updateCalls += 1;
        if (updateCalls === 1) {
          expect(params).toEqual([
            "existing-phone-user",
            "race@example.com",
            null,
            "+79993334455",
          ]);
          throw {
            code: "23505",
            constraint: "uq_platform_users_email_normalized_active",
          };
        }
        expect(params).toEqual([
          "existing-phone-user",
          null,
          null,
          "+79993334455",
        ]);
      }
      return { rows: [] };
    });

    const result = await pgUserProjectionPort.ensureClientFromAppointmentProjection({
      phoneNormalized: "+79993334455",
      email: "race@example.com",
    });

    expect(result.platformUserId).toBe("existing-phone-user");
    expect(result.contactEmailSetup).toBeUndefined();
    expect(updateCalls).toBe(2);
  });
});
