import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import type { ManualMergeResolution } from "@/infra/repos/manualMergeResolution";
import { MergeConflictError, MergeDependentConflictError } from "@/infra/repos/platformUserMergeErrors";
import { mergePlatformUsersInTransaction, pickMergeTargetId } from "@/infra/repos/pgPlatformUserMerge";

const uid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const T = uid(1);
const D = uid(2);

function makeClient(sqlLog: string[]): PoolClient {
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    sqlLog.push(sql);
    const s = String(sql);
    if (s.includes("FROM platform_users") && s.includes("FOR UPDATE")) {
      return {
        rows: [
          {
            id: T,
            phone_normalized: "+79000000000",
            integrator_user_id: "100",
            merged_into_id: null,
            display_name: "A",
            first_name: "A",
            last_name: "A",
            email: "a@a.co",
            email_verified_at: new Date("2020-01-02"),
            role: "client",
            created_at: new Date("2020-01-01"),
          },
          {
            id: D,
            phone_normalized: "+79000000001",
            integrator_user_id: null,
            merged_into_id: null,
            display_name: "B",
            first_name: "B",
            last_name: "B",
            email: "b@b.co",
            email_verified_at: null,
            role: "client",
            created_at: new Date("2021-01-01"),
          },
        ],
      };
    }
    if (s.includes("FROM user_pins")) {
      return { rows: [] };
    }
    if (s.includes("FROM user_oauth_bindings WHERE user_id = ANY")) {
      return { rows: [] };
    }
    return { rows: [], rowCount: 0 };
  });
  return { query } as unknown as PoolClient;
}

function baseResolution(over: Partial<ManualMergeResolution> = {}): ManualMergeResolution {
  return {
    targetId: T,
    duplicateId: D,
    fields: {
      phone_normalized: "target",
      display_name: "duplicate",
      first_name: "target",
      last_name: "duplicate",
      email: "target",
    },
    bindings: { telegram: "both", max: "both", vk: "both" },
    oauth: {},
    channelPreferences: "merge",
    ...over,
  };
}

describe("mergePlatformUsersInTransaction (manual)", () => {
  it("updates media ownership rows in the same transaction path", async () => {
    const sqlLog: string[] = [];
    const client = makeClient(sqlLog);
    await mergePlatformUsersInTransaction(client, T, D, "manual", { resolution: baseResolution() });
    expect(sqlLog.some((s) => s.includes("UPDATE media_files SET uploaded_by"))).toBe(true);
    expect(sqlLog.some((s) => s.includes("UPDATE media_upload_sessions SET owner_user_id"))).toBe(true);
  });

  it("uses scalar CASE branches from ManualMergeResolution.fields", async () => {
    const sqlLog: string[] = [];
    const client = makeClient(sqlLog);
    await mergePlatformUsersInTransaction(client, T, D, "manual", { resolution: baseResolution() });
    const upd = sqlLog.find((s) => s.includes("UPDATE platform_users AS pu") && s.includes("CASE WHEN $3::text = 'target'"));
    expect(upd).toBeTruthy();
  });

  it("preserves email_verified_at based on the surviving email", async () => {
    const sqlLog: string[] = [];
    const client = makeClient(sqlLog);
    await mergePlatformUsersInTransaction(client, T, D, "manual", { resolution: baseResolution() });
    const upd = sqlLog.find((s) => s.includes("UPDATE platform_users AS pu") && s.includes("email_verified_at = CASE"));
    expect(upd).toBeTruthy();
  });

  it("rejects two different non-null integrator_user_id with MergeConflictError", async () => {
    const query = vi.fn(async (sql: string) => {
      const s = String(sql);
      if (s.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              id: T,
              phone_normalized: "+79000000000",
              integrator_user_id: "100",
              merged_into_id: null,
              display_name: "A",
              first_name: null,
              last_name: null,
              email: null,
              email_verified_at: null,
              role: "client",
              created_at: new Date(),
            },
            {
              id: D,
              phone_normalized: "+79000000000",
              integrator_user_id: "200",
              merged_into_id: null,
              display_name: "B",
              first_name: null,
              last_name: null,
              email: null,
              email_verified_at: null,
              role: "client",
              created_at: new Date(),
            },
          ],
        };
      }
      return { rows: [] };
    });
    const client = { query } as unknown as PoolClient;
    await expect(
      mergePlatformUsersInTransaction(client, T, D, "manual", {
        resolution: baseResolution(),
      }),
    ).rejects.toThrow(MergeConflictError);
  });

  it("allows two different non-null integrator_user_id for manual merge when allowDistinctIntegratorUserIds", async () => {
    const query = vi.fn(async (sql: string) => {
      const s = String(sql);
      if (s.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              id: T,
              phone_normalized: "+79000000000",
              integrator_user_id: "100",
              merged_into_id: null,
              display_name: "A",
              first_name: null,
              last_name: null,
              email: null,
              email_verified_at: null,
              role: "client",
              created_at: new Date(),
            },
            {
              id: D,
              phone_normalized: "+79000000000",
              integrator_user_id: "200",
              merged_into_id: null,
              display_name: "B",
              first_name: null,
              last_name: null,
              email: null,
              email_verified_at: null,
              role: "client",
              created_at: new Date(),
            },
          ],
        };
      }
      if (s.includes("FROM user_pins")) {
        return { rows: [] };
      }
      if (s.includes("FROM user_oauth_bindings WHERE user_id = ANY")) {
        return { rows: [] };
      }
      if (s.includes("COUNT(*)::int") || s.includes("patient_bookings pb1")) {
        return { rows: [{ c: 0 }] };
      }
      return { rows: [], rowCount: 0 };
    });
    const client = { query } as unknown as PoolClient;
    await mergePlatformUsersInTransaction(client, T, D, "manual", {
      resolution: baseResolution(),
      allowDistinctIntegratorUserIds: true,
      verifiedDistinctIntegratorUserIds: {
        targetIntegratorUserId: "100",
        duplicateIntegratorUserId: "200",
      },
    });
    expect(query).toHaveBeenCalled();
  });

  it("rejects relaxed manual merge when locked integrator ids differ from gate snapshot", async () => {
    const query = vi.fn(async (sql: string) => {
      const s = String(sql);
      if (s.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              id: T,
              phone_normalized: "+79000000000",
              integrator_user_id: "100",
              merged_into_id: null,
              display_name: "A",
              first_name: null,
              last_name: null,
              email: null,
              email_verified_at: null,
              role: "client",
              created_at: new Date(),
            },
            {
              id: D,
              phone_normalized: "+79000000000",
              integrator_user_id: "200",
              merged_into_id: null,
              display_name: "B",
              first_name: null,
              last_name: null,
              email: null,
              email_verified_at: null,
              role: "client",
              created_at: new Date(),
            },
          ],
        };
      }
      return { rows: [] };
    });
    const client = { query } as unknown as PoolClient;

    await expect(
      mergePlatformUsersInTransaction(client, T, D, "manual", {
        resolution: baseResolution(),
        allowDistinctIntegratorUserIds: true,
        verifiedDistinctIntegratorUserIds: {
          targetIntegratorUserId: "100",
          duplicateIntegratorUserId: "999",
        },
      }),
    ).rejects.toThrow("merge: integrator ids changed since gate");
  });

  it("rejects non-client rows before mutating data", async () => {
    const query = vi.fn(async (sql: string) => {
      const s = String(sql);
      if (s.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              id: T,
              phone_normalized: "+79000000000",
              integrator_user_id: "100",
              merged_into_id: null,
              display_name: "A",
              first_name: null,
              last_name: null,
              email: null,
              email_verified_at: null,
              role: "doctor",
              created_at: new Date(),
            },
            {
              id: D,
              phone_normalized: "+79000000000",
              integrator_user_id: null,
              merged_into_id: null,
              display_name: "B",
              first_name: null,
              last_name: null,
              email: null,
              email_verified_at: null,
              role: "client",
              created_at: new Date(),
            },
          ],
        };
      }
      return { rows: [] };
    });
    const client = { query } as unknown as PoolClient;
    await expect(
      mergePlatformUsersInTransaction(client, T, D, "manual", {
        resolution: baseResolution(),
      }),
    ).rejects.toThrow(MergeConflictError);
  });

  it('with bindings.telegram "both", reassigns duplicate-only messenger row to target (no INSERT+ON CONFLICT trap)', async () => {
    const sqlLog: string[] = [];
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      const s = String(sql);
      sqlLog.push(s);
      if (s.includes("FOR UPDATE") && s.includes("FROM platform_users")) {
        return {
          rows: [
            {
              id: T,
              phone_normalized: "+79000000000",
              integrator_user_id: "100",
              merged_into_id: null,
              display_name: "A",
              first_name: null,
              last_name: null,
              email: null,
              email_verified_at: null,
              role: "client",
              created_at: new Date(),
            },
            {
              id: D,
              phone_normalized: "+79000000001",
              integrator_user_id: null,
              merged_into_id: null,
              display_name: "B",
              first_name: null,
              last_name: null,
              email: null,
              email_verified_at: null,
              role: "client",
              created_at: new Date(),
            },
          ],
        };
      }
      if (s.includes("FROM user_channel_bindings") && s.includes("user_id = ANY") && params?.[1] === "telegram") {
        return { rows: [{ user_id: D }] };
      }
      if (s.includes("FROM user_channel_bindings") && s.includes("user_id = ANY")) {
        return { rows: [] };
      }
      if (s.includes("FROM user_oauth_bindings WHERE user_id = ANY")) {
        return { rows: [] };
      }
      if (s.includes("FROM user_pins")) {
        return { rows: [] };
      }
      if (s.includes("patient_bookings pb1")) {
        return { rows: [{ c: "0" }] };
      }
      if (s.includes("patient_lfk_assignments a")) {
        return { rows: [{ c: "0" }] };
      }
      return { rows: [], rowCount: 0 };
    });
    const client = { query } as unknown as PoolClient;
    await mergePlatformUsersInTransaction(client, T, D, "manual", { resolution: baseResolution() });

    const upd = sqlLog.find(
      (q) =>
        q.includes("UPDATE user_channel_bindings SET user_id") &&
        q.includes("WHERE user_id = $2::uuid AND channel_code = $3"),
    );
    expect(upd).toBeTruthy();
    const ins = sqlLog.filter(
      (q) => q.includes("INSERT INTO user_channel_bindings") && q.includes("ON CONFLICT (channel_code, external_id)"),
    );
    expect(ins.length).toBe(0);
  });

  it('rejects "both" when both users already have a binding for the same channel', async () => {
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      const s = String(sql);
      if (s.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              id: T,
              phone_normalized: "+79000000000",
              integrator_user_id: "100",
              merged_into_id: null,
              display_name: "A",
              first_name: null,
              last_name: null,
              email: null,
              email_verified_at: null,
              role: "client",
              created_at: new Date(),
            },
            {
              id: D,
              phone_normalized: null,
              integrator_user_id: null,
              merged_into_id: null,
              display_name: "B",
              first_name: null,
              last_name: null,
              email: null,
              email_verified_at: null,
              role: "client",
              created_at: new Date(),
            },
          ],
        };
      }
      if (s.includes("FROM user_channel_bindings")) {
        if (params?.[1] === "telegram") {
          return {
            rows: [{ user_id: T }, { user_id: D }],
          };
        }
        return { rows: [] };
      }
      if (s.includes("FROM user_oauth_bindings WHERE user_id = ANY")) {
        return { rows: [] };
      }
      if (s.includes("COUNT(*)::int") || s.includes("patient_bookings pb1")) {
        return { rows: [{ c: 0 }] };
      }
      if (s.includes("FROM user_pins")) {
        return { rows: [] };
      }
      return { rows: [], rowCount: 0 };
    });
    const client = { query } as unknown as PoolClient;
    await expect(
      mergePlatformUsersInTransaction(client, T, D, "manual", {
        resolution: baseResolution({
          bindings: { telegram: "both", max: "target", vk: "target" },
        }),
      }),
    ).rejects.toThrow(MergeConflictError);
  });

  it("MergeDependentConflictError carries candidateIds for booking overlap guard", async () => {
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      const s = String(sql);
      if (s.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              id: T,
              phone_normalized: "+79000000000",
              integrator_user_id: "100",
              merged_into_id: null,
              display_name: "A",
              first_name: null,
              last_name: null,
              email: null,
              email_verified_at: null,
              role: "client",
              created_at: new Date(),
            },
            {
              id: D,
              phone_normalized: null,
              integrator_user_id: null,
              merged_into_id: null,
              display_name: "B",
              first_name: null,
              last_name: null,
              email: null,
              email_verified_at: null,
              role: "client",
              created_at: new Date(),
            },
          ],
        };
      }
      if (s.includes("patient_bookings pb1")) {
        return { rows: [{ c: "1" }] };
      }
      if (s.includes("meaningfulCount") || s.includes("FROM patient_bookings WHERE platform_user_id")) {
        return { rows: [{ c: 0 }] };
      }
      if (s.includes("COUNT(*)::int") && params?.[0] === T) {
        return { rows: [{ c: 0 }] };
      }
      if (s.includes("COUNT(*)::int")) {
        return { rows: [{ c: 0 }] };
      }
      return { rows: [] };
    });
    try {
      const client = { query } as unknown as PoolClient;
      await mergePlatformUsersInTransaction(client, T, D, "manual", {
        resolution: baseResolution(),
      });
      expect.fail("expected MergeDependentConflictError");
    } catch (e) {
      expect(e).toBeInstanceOf(MergeDependentConflictError);
      expect((e as MergeDependentConflictError).candidateIds).toEqual([T, D]);
    }
  });

  it("auto (projection) merge reassigns channel/oauth bindings via UPDATE, not INSERT+ON CONFLICT+DELETE trap", async () => {
    const sqlLog: string[] = [];
    const query = vi.fn(async (sql: string) => {
      const s = String(sql);
      sqlLog.push(s);
      if (s.includes("FROM platform_users") && s.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              id: T,
              phone_normalized: "+79000000000",
              integrator_user_id: "100",
              merged_into_id: null,
              display_name: "A",
              first_name: null,
              last_name: null,
              email: null,
              email_verified_at: null,
              role: "client",
              created_at: new Date("2020-01-01"),
            },
            {
              id: D,
              phone_normalized: "+79000000000",
              integrator_user_id: null,
              merged_into_id: null,
              display_name: "B",
              first_name: null,
              last_name: null,
              email: null,
              email_verified_at: null,
              role: "client",
              created_at: new Date("2021-01-01"),
            },
          ],
        };
      }
      if (s.includes("FROM user_oauth_bindings WHERE user_id = ANY")) {
        return { rows: [] };
      }
      if (s.includes("FROM user_pins")) {
        return { rows: [] };
      }
      if (s.includes("patient_bookings pb1")) {
        return { rows: [{ c: "0" }] };
      }
      if (s.includes("patient_lfk_assignments a")) {
        return { rows: [{ c: "0" }] };
      }
      return { rows: [], rowCount: 0 };
    });
    const client = { query } as unknown as PoolClient;
    await mergePlatformUsersInTransaction(client, T, D, "projection");

    expect(sqlLog.some((q) => q.includes("UPDATE user_channel_bindings SET user_id"))).toBe(true);
    expect(sqlLog.some((q) => q.includes("UPDATE user_oauth_bindings SET user_id"))).toBe(true);
    expect(
      sqlLog.filter(
        (q) =>
          q.includes("INSERT INTO user_channel_bindings") && q.includes("ON CONFLICT (channel_code, external_id)"),
      ),
    ).toHaveLength(0);
    expect(
      sqlLog.filter(
        (q) =>
          q.includes("INSERT INTO user_oauth_bindings") && q.includes("ON CONFLICT (provider, provider_user_id)"),
      ),
    ).toHaveLength(0);
  });
});

describe("MergeDependentConflictError", () => {
  it("exposes candidateIds like MergeConflictError", () => {
    const e = new MergeDependentConflictError("x", ["a", "b"]);
    expect(e.candidateIds).toEqual(["a", "b"]);
  });
});

describe("pickMergeTargetId", () => {
  const cand = (
    id: string,
    phone: string | null,
    integrator: string | null,
    created: string,
  ) => ({
    id,
    phone_normalized: phone,
    integrator_user_id: integrator,
    created_at: new Date(created),
  });

  it("prefers row with phone when the other has none", () => {
    const withPhone = cand("a", "+7900", null, "2021-01-01");
    const noPhone = cand("b", null, "99", "2020-01-01");
    expect(pickMergeTargetId(withPhone, noPhone)).toEqual({ target: "a", duplicate: "b" });
    expect(pickMergeTargetId(noPhone, withPhone)).toEqual({ target: "a", duplicate: "b" });
  });

  it("when both share phone, prefers older created_at over integrator id", () => {
    const olderNoInt = cand("crm", "+7900", null, "2020-01-01");
    const newerBot = cand("bot", "+7900", "100", "2021-06-01");
    expect(pickMergeTargetId(olderNoInt, newerBot)).toEqual({ target: "crm", duplicate: "bot" });
    expect(pickMergeTargetId(newerBot, olderNoInt)).toEqual({ target: "crm", duplicate: "bot" });
  });

  it("when both share phone and same created_at, falls back to integrator id", () => {
    const d = "2020-01-01";
    const withInt = cand("a", "+7900", "1", d);
    const noInt = cand("b", "+7900", null, d);
    expect(pickMergeTargetId(withInt, noInt)).toEqual({ target: "a", duplicate: "b" });
  });
});
