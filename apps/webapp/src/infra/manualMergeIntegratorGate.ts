import { NextResponse } from "next/server";
import type { Pool } from "pg";
import { checkIntegratorCanonicalPair } from "@/infra/integrations/integratorUserMergeM2mClient";
import type { VerifiedDistinctIntegratorUserIds } from "@/infra/repos/pgPlatformUserMerge";
import { getConfigBool } from "@/modules/system-settings/configAdapter";

function normIntegratorId(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export type ManualMergeIntegratorGateOk = {
  ok: true;
  allowDistinctIntegratorUserIds: boolean;
  verifiedDistinctIntegratorUserIds?: VerifiedDistinctIntegratorUserIds;
};

export type ManualMergeIntegratorGateFail = {
  ok: false;
  response: NextResponse;
};

/**
 * Before manual webapp merge: v1 leaves two different non-null integrator_user_id to the merge engine (same error as before Stage 5).
 * With `platform_user_merge_v2_enabled`, require integrator canonical alignment (M2M `canonical-pair`) before allowing distinct ids.
 */
export async function verifyManualMergeIntegratorIntegratorGate(
  pool: Pool,
  targetId: string,
  duplicateId: string,
): Promise<ManualMergeIntegratorGateOk | ManualMergeIntegratorGateFail> {
  const v2 = await getConfigBool("platform_user_merge_v2_enabled", false);
  const r = await pool.query<{ id: string; integrator_user_id: string | null }>(
    `SELECT id::text AS id, integrator_user_id::text AS integrator_user_id
     FROM platform_users
     WHERE id IN ($1::uuid, $2::uuid)`,
    [targetId, duplicateId],
  );
  const byId = new Map(r.rows.map((row) => [row.id, row.integrator_user_id]));
  const iTarget = normIntegratorId(byId.get(targetId) ?? null);
  const iDup = normIntegratorId(byId.get(duplicateId) ?? null);

  if (!iTarget || !iDup || iTarget === iDup) {
    return { ok: true, allowDistinctIntegratorUserIds: false };
  }

  /** v1: same as pre–Stage-5 — no early 409; `mergePlatformUsersInTransaction` rejects with `MergeConflictError`. */
  if (!v2) {
    return { ok: true, allowDistinctIntegratorUserIds: false };
  }

  const st = await checkIntegratorCanonicalPair(iTarget, iDup);
  if (!st.ok) {
    if (st.reason === "unconfigured" || st.reason === "timeout") {
      return {
        ok: false,
        response: NextResponse.json(
          {
            ok: false,
            error: "merge_failed",
            code: "integrator_merge_status_unavailable",
            message:
              "Integrator canonical merge status is currently unavailable (configuration missing or request timed out).",
          },
          { status: 503 },
        ),
      };
    }
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: "merge_failed",
          code: "integrator_canonical_status_failed",
          message: `Integrator canonical-pair check failed (HTTP ${st.status}).`,
        },
        { status: 502 },
      ),
    };
  }

  if (!st.sameCanonical) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: "merge_failed",
          code: "integrator_canonical_merge_required",
          message:
            "Integrator users are not merged to the same canonical id yet — run integrator merge first, then webapp projection realignment if needed.",
        },
        { status: 409 },
      ),
    };
  }

  return {
    ok: true,
    allowDistinctIntegratorUserIds: true,
    verifiedDistinctIntegratorUserIds: {
      targetIntegratorUserId: iTarget,
      duplicateIntegratorUserId: iDup,
    },
  };
}
