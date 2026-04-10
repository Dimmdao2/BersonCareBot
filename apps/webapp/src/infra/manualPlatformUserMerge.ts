import type { Pool } from "pg";
import { writeAuditLog } from "@/infra/adminAuditLog";
import type { ManualMergeResolution } from "@/infra/repos/manualMergeResolution";
import { mergePlatformUsersInTransaction } from "@/infra/repos/pgPlatformUserMerge";
import { withTwoUserLifecycleLocksExclusive } from "@/infra/userLifecycleLock";

export type ManualMergeOk = {
  ok: true;
  targetId: string;
  duplicateId: string;
};

export type ManualMergeFail = {
  ok: false;
  error: string;
  code?: string;
};

/**
 * Applies manual merge with dual exclusive lifecycle locks and `mergePlatformUsersInTransaction(..., "manual", { resolution })`.
 * Audit `user_merge` is written in a **separate** transaction after the merge transaction completes.
 */
export async function runManualPlatformUserMerge(
  pool: Pool,
  actorId: string | null,
  resolution: ManualMergeResolution,
  options?: { allowDistinctIntegratorUserIds?: boolean },
): Promise<ManualMergeOk | ManualMergeFail> {
  const { targetId, duplicateId } = resolution;
  try {
    await withTwoUserLifecycleLocksExclusive(pool, targetId, duplicateId, async (client) => {
      await mergePlatformUsersInTransaction(client, targetId, duplicateId, "manual", {
        resolution,
        allowDistinctIntegratorUserIds: options?.allowDistinctIntegratorUserIds,
      });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await writeAuditLog(pool, {
      actorId,
      action: "user_merge",
      targetId,
      details: {
        targetId,
        duplicateId,
        phase: "merge_transaction",
        error: msg,
      },
      status: "error",
    });
    return { ok: false, error: msg };
  }

  await writeAuditLog(pool, {
    actorId,
    action: "user_merge",
    targetId,
    details: {
      targetId,
      duplicateId,
      resolution,
      /** Operator-facing conflicts were resolved via `resolution` (no separate list in v1). */
      conflictsResolved: [],
      /** v1: row-level counts not computed; `media_files.uploaded_by` repoint happens inside merge transaction. */
      dependentRowsMoved: { mediaFilesUploadedByRepointedInMergeTx: true },
    },
    status: "ok",
  });

  return { ok: true, targetId, duplicateId };
}
