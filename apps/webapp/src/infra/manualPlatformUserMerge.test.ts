/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MergeConflictError } from "@/infra/repos/platformUserMergeErrors";

const writeAuditLogMock = vi.fn();
const mergeTxMock = vi.fn();
const withTwoLocksMock = vi.fn();

vi.mock("@/infra/adminAuditLog", () => ({
  writeAuditLog: (...a: unknown[]) => writeAuditLogMock(...a),
}));

vi.mock("@/infra/userLifecycleLock", () => ({
  withTwoUserLifecycleLocksExclusive: (...a: unknown[]) => withTwoLocksMock(...a),
}));

vi.mock("@/infra/repos/pgPlatformUserMerge", () => ({
  mergePlatformUsersInTransaction: (...a: unknown[]) => mergeTxMock(...a),
}));

const t1 = "00000000-0000-4000-8000-000000000001";
const t2 = "00000000-0000-4000-8000-000000000002";

const baseResolution = {
  targetId: t1,
  duplicateId: t2,
  fields: {
    phone_normalized: "target" as const,
    display_name: "target" as const,
    first_name: "target" as const,
    last_name: "target" as const,
    email: "target" as const,
  },
  bindings: { telegram: "both" as const, max: "both" as const, vk: "both" as const },
  oauth: {} as Record<string, "target" | "duplicate">,
  channelPreferences: "merge" as const,
};

describe("runManualPlatformUserMerge", () => {
  const pool = {} as import("pg").Pool;

  beforeEach(() => {
    writeAuditLogMock.mockReset();
    mergeTxMock.mockReset();
    withTwoLocksMock.mockReset();
    writeAuditLogMock.mockResolvedValue(undefined);
    mergeTxMock.mockResolvedValue(undefined);
    withTwoLocksMock.mockImplementation(
      async (_pool: unknown, a: string, b: string, fn: (c: unknown) => Promise<void>) => {
        expect([a, b].sort()).toEqual([t1, t2]);
        await fn({});
      },
    );
  });

  it("runs merge inside withTwoUserLifecycleLocksExclusive (locks use sorted ids; merge uses target/duplicate)", async () => {
    const { runManualPlatformUserMerge } = await import("@/infra/manualPlatformUserMerge");
    await runManualPlatformUserMerge(pool, "00000000-0000-4000-8000-0000000000aa", {
      ...baseResolution,
      targetId: t2,
      duplicateId: t1,
    });
    expect(withTwoLocksMock).toHaveBeenCalled();
    expect(mergeTxMock).toHaveBeenCalledWith(
      {},
      t2,
      t1,
      "manual",
      expect.objectContaining({
        resolution: expect.anything(),
        verifiedDistinctIntegratorUserIds: undefined,
      }),
    );
  });

  it("writes ok audit after successful merge (separate from merge tx), with v1 detail fields", async () => {
    const order: string[] = [];
    mergeTxMock.mockImplementation(async () => {
      order.push("merge");
    });
    writeAuditLogMock.mockImplementation(async () => {
      order.push("audit");
    });

    const { runManualPlatformUserMerge } = await import("@/infra/manualPlatformUserMerge");
    const r = await runManualPlatformUserMerge(pool, "00000000-0000-4000-8000-0000000000aa", baseResolution);

    expect(r).toEqual({ ok: true, targetId: t1, duplicateId: t2 });
    expect(order).toEqual(["merge", "audit"]);
    expect(writeAuditLogMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        actorId: "00000000-0000-4000-8000-0000000000aa",
        action: "user_merge",
        targetId: t1,
        status: "ok",
        details: expect.objectContaining({
          resolution: baseResolution,
          conflictsResolved: [],
          dependentRowsMoved: {
            mediaFilesUploadedByRepointedInMergeTx: true,
            mediaUploadSessionsOwnerRepointedInMergeTx: true,
          },
        }),
      }),
    );
  });

  it("writes error audit when merge throws (e.g. hard blocker), without ok audit", async () => {
    mergeTxMock.mockRejectedValueOnce(new Error("two different non-null integrator_user_id"));

    const { runManualPlatformUserMerge } = await import("@/infra/manualPlatformUserMerge");
    const r = await runManualPlatformUserMerge(pool, null, baseResolution);

    expect(r).toEqual({
      ok: false,
      error: "two different non-null integrator_user_id",
    });
    expect(writeAuditLogMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        actorId: null,
        action: "user_merge",
        targetId: t1,
        status: "error",
        details: expect.objectContaining({
          phase: "merge_transaction",
          error: "two different non-null integrator_user_id",
        }),
      }),
    );
  });

  it("returns a dedicated code when integrator ids changed after gate", async () => {
    mergeTxMock.mockRejectedValueOnce(new MergeConflictError("merge: integrator ids changed since gate"));

    const { runManualPlatformUserMerge } = await import("@/infra/manualPlatformUserMerge");
    const r = await runManualPlatformUserMerge(pool, null, baseResolution, {
      allowDistinctIntegratorUserIds: true,
      verifiedDistinctIntegratorUserIds: {
        targetIntegratorUserId: "100",
        duplicateIntegratorUserId: "200",
      },
    });

    expect(r).toEqual({
      ok: false,
      error: "merge: integrator ids changed since gate",
      code: "integrator_ids_changed_since_gate",
    });
  });
});
