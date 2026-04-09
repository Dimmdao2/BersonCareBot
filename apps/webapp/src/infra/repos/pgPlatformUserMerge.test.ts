import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import type { ManualMergeResolution } from "@/infra/repos/manualMergeResolution";
import { MergeConflictError, MergeDependentConflictError } from "@/infra/repos/platformUserMergeErrors";
import { mergePlatformUsersInTransaction } from "@/infra/repos/pgPlatformUserMerge";

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
  it("updates media_files.uploaded_by in the same transaction path", async () => {
    const sqlLog: string[] = [];
    const client = makeClient(sqlLog);
    await mergePlatformUsersInTransaction(client, T, D, "manual", { resolution: baseResolution() });
    expect(sqlLog.some((s) => s.includes("UPDATE media_files SET uploaded_by"))).toBe(true);
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
});

describe("MergeDependentConflictError", () => {
  it("exposes candidateIds like MergeConflictError", () => {
    const e = new MergeDependentConflictError("x", ["a", "b"]);
    expect(e.candidateIds).toEqual(["a", "b"]);
  });
});
