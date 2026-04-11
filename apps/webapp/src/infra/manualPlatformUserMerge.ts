import type { Pool } from "pg";
import { writeAuditLog } from "@/infra/adminAuditLog";
import { fetchMergePartyDisplayLabels } from "@/infra/mergeAuditLabels";
import type { ManualMergeResolution } from "@/infra/repos/manualMergeResolution";
import { mergePlatformUsersInTransaction } from "@/infra/repos/pgPlatformUserMerge";
import type { VerifiedDistinctIntegratorUserIds } from "@/infra/repos/pgPlatformUserMerge";
import { MergeConflictError } from "@/infra/repos/platformUserMergeErrors";
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
  options?: {
    allowDistinctIntegratorUserIds?: boolean;
    verifiedDistinctIntegratorUserIds?: VerifiedDistinctIntegratorUserIds;
  },
): Promise<ManualMergeOk | ManualMergeFail> {
  const { targetId, duplicateId } = resolution;
  const partyLabels = await fetchMergePartyDisplayLabels(pool, targetId, duplicateId);
  try {
    await withTwoUserLifecycleLocksExclusive(pool, targetId, duplicateId, async (client) => {
      await mergePlatformUsersInTransaction(client, targetId, duplicateId, "manual", {
        resolution,
        allowDistinctIntegratorUserIds: options?.allowDistinctIntegratorUserIds,
        verifiedDistinctIntegratorUserIds: options?.verifiedDistinctIntegratorUserIds,
      });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code =
      e instanceof MergeConflictError && msg === "merge: integrator ids changed since gate"
        ? "integrator_ids_changed_since_gate"
        : undefined;
    await writeAuditLog(pool, {
      actorId,
      action: "user_merge",
      targetId,
      details: {
        targetId,
        duplicateId,
        targetDisplayName: partyLabels.targetDisplayName,
        duplicateDisplayName: partyLabels.duplicateDisplayName,
        phase: "merge_transaction",
        error: msg,
      },
      status: "error",
    });
    return { ok: false, error: msg, code };
  }

  await writeAuditLog(pool, {
    actorId,
    action: "user_merge",
    targetId,
    details: {
      targetId,
      duplicateId,
      targetDisplayName: partyLabels.targetDisplayName,
      duplicateDisplayName: partyLabels.duplicateDisplayName,
      resolution,
      /** Operator-facing conflicts were resolved via `resolution` (no separate list in v1). */
      conflictsResolved: [],
      /** v1: row-level counts not computed; ownership repoints happen inside the merge transaction. */
      dependentRowsMoved: {
        mediaFilesUploadedByRepointedInMergeTx: true,
        mediaUploadSessionsOwnerRepointedInMergeTx: true,
      },
    },
    status: "ok",
  });

  return { ok: true, targetId, duplicateId };
}
