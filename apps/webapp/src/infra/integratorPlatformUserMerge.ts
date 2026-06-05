import type { Pool, PoolClient } from "pg";
import { callIntegratorUserMerge } from "@/infra/integrations/integratorUserMergeM2mClient";
import { writeAuditLog } from "@/infra/adminAuditLog";
import { logger } from "@/infra/logging/logger";
import { fetchMergePartyDisplayLabels } from "@/infra/mergeAuditLabels";
import { runIdentityClientPgText } from "@/infra/repos/identityPhoneSql";
import {
  integratorUserIdNumericKey,
  parseIntegratorMergeHttpDetails,
  parseIntegratorMergeHttpError,
  platformUserMergePrecheckRowSchema,
} from "@/infra/integratorPlatformUserMergeSchemas";

async function recordIntegratorMergeFailure(params: {
  pool: Pool;
  actorId: string;
  targetId: string;
  duplicateId: string;
  dryRun: boolean;
  phase: string;
  error: string;
  httpStatus?: number;
}): Promise<void> {
  const labels = await fetchMergePartyDisplayLabels(params.pool, params.targetId, params.duplicateId);
  const errSnippet = params.error.slice(0, 2_000);
  logger.error(
    {
      action: "integrator_user_merge",
      phase: params.phase,
      targetId: params.targetId,
      duplicateId: params.duplicateId,
      dryRun: params.dryRun,
      httpStatus: params.httpStatus,
      err: errSnippet,
    },
    "[integrator-merge] failed",
  );
  await writeAuditLog(params.pool, {
    actorId: params.actorId,
    action: "integrator_user_merge",
    targetId: params.targetId,
    details: {
      targetId: params.targetId,
      duplicateId: params.duplicateId,
      targetDisplayName: labels.targetDisplayName,
      duplicateDisplayName: labels.duplicateDisplayName,
      phase: params.phase,
      dryRun: params.dryRun,
      error: errSnippet,
      httpStatus: params.httpStatus ?? null,
    },
    status: "error",
  });
}

export type IntegratorPlatformUserMergeResult =
  | { ok: true; status: 200; body: Record<string, unknown> }
  | { ok: false; status: number; body: Record<string, unknown> };

async function loadPlatformUsersForMergePrecheck(
  client: PoolClient,
  targetId: string,
  duplicateId: string,
) {
  const r = await runIdentityClientPgText<{
    id: string;
    role: string;
    merged_into_id: string | null;
    integrator_user_id: string | null;
  }>(
    client,
    `SELECT id::text AS id, role, merged_into_id::text AS merged_into_id, integrator_user_id::text AS integrator_user_id
     FROM platform_users
     WHERE id IN ($1::uuid, $2::uuid)
     ORDER BY id
     FOR UPDATE`,
    [targetId, duplicateId],
  );
  return r.rows.map((row) => platformUserMergePrecheckRowSchema.parse(row));
}

async function clearDuplicateIntegratorUserId(
  client: PoolClient,
  duplicateId: string,
  loser: string,
): Promise<number> {
  const up = await runIdentityClientPgText(
    client,
    `UPDATE platform_users SET integrator_user_id = NULL WHERE id = $1::uuid AND integrator_user_id = $2::bigint`,
    [duplicateId, loser],
  );
  return up.rowCount ?? 0;
}

/**
 * Integrator-side canonical user merge with row lock held through M2M decision.
 * Class C TX: `BEGIN` / `COMMIT` / `ROLLBACK` on dedicated `PoolClient`; domain SQL via unified executor.
 */
export async function executeIntegratorPlatformUserMerge(params: {
  pool: Pool;
  actorId: string;
  targetId: string;
  duplicateId: string;
  dryRun?: boolean;
}): Promise<IntegratorPlatformUserMergeResult> {
  const { pool, actorId, targetId, duplicateId } = params;
  const dryRun = params.dryRun === true;

  const client = await pool.connect();
  let txOpen = false;
  try {
    await client.query("BEGIN");
    txOpen = true;

    const rows = await loadPlatformUsersForMergePrecheck(client, targetId, duplicateId);
    if (rows.length !== 2) {
      await client.query("ROLLBACK");
      txOpen = false;
      await recordIntegratorMergeFailure({
        pool,
        actorId,
        targetId,
        duplicateId,
        dryRun,
        phase: "precheck_missing_user",
        error: "missing_user",
      });
      return { ok: false, status: 404, body: { ok: false, error: "missing_user" } };
    }

    const byId = new Map(rows.map((row) => [row.id, row]));
    const tRow = byId.get(targetId);
    const dRow = byId.get(duplicateId);
    if (!tRow || !dRow) {
      await client.query("ROLLBACK");
      txOpen = false;
      await recordIntegratorMergeFailure({
        pool,
        actorId,
        targetId,
        duplicateId,
        dryRun,
        phase: "precheck_missing_user",
        error: "missing_user",
      });
      return { ok: false, status: 404, body: { ok: false, error: "missing_user" } };
    }

    if (tRow.role !== "client" || dRow.role !== "client") {
      await client.query("ROLLBACK");
      txOpen = false;
      await recordIntegratorMergeFailure({
        pool,
        actorId,
        targetId,
        duplicateId,
        dryRun,
        phase: "precheck_role",
        error: "not_client",
      });
      return { ok: false, status: 400, body: { ok: false, error: "not_client" } };
    }

    if (tRow.merged_into_id != null || dRow.merged_into_id != null) {
      await client.query("ROLLBACK");
      txOpen = false;
      await recordIntegratorMergeFailure({
        pool,
        actorId,
        targetId,
        duplicateId,
        dryRun,
        phase: "precheck_merged_alias",
        error: "alias_not_allowed",
      });
      return { ok: false, status: 409, body: { ok: false, error: "alias_not_allowed" } };
    }

    const winner = tRow.integrator_user_id?.trim() || "";
    const loser = dRow.integrator_user_id?.trim() || "";
    if (!winner || !loser || winner === loser) {
      await client.query("ROLLBACK");
      txOpen = false;
      await recordIntegratorMergeFailure({
        pool,
        actorId,
        targetId,
        duplicateId,
        dryRun,
        phase: "precheck_integrator_ids",
        error: "integrator_ids_not_divergent",
      });
      return {
        ok: false,
        status: 400,
        body: {
          ok: false,
          error: "integrator_ids_not_divergent",
          message: "Both platform users must have different non-null integrator_user_id for integrator merge.",
        },
      };
    }

    const merged = await callIntegratorUserMerge({
      winnerIntegratorUserId: winner,
      loserIntegratorUserId: loser,
      dryRun,
    });

    if (!merged.ok) {
      await client.query("ROLLBACK");
      txOpen = false;

      if (merged.reason === "unconfigured") {
        await recordIntegratorMergeFailure({
          pool,
          actorId,
          targetId,
          duplicateId,
          dryRun,
          phase: "integrator_unconfigured",
          error: "integrator_unconfigured",
        });
        return {
          ok: false,
          status: 503,
          body: {
            ok: false,
            error: "integrator_unconfigured",
            message: "INTEGRATOR_API_URL or webhook secret missing.",
          },
        };
      }

      if (merged.reason === "timeout") {
        await recordIntegratorMergeFailure({
          pool,
          actorId,
          targetId,
          duplicateId,
          dryRun,
          phase: "integrator_timeout",
          error: "integrator_timeout",
        });
        return {
          ok: false,
          status: 503,
          body: {
            ok: false,
            error: "integrator_timeout",
            message: "Integrator merge request timed out.",
          },
        };
      }

      const parsedHttpErr = parseIntegratorMergeHttpError(merged.bodyText) ?? {};
      const missing = parsedHttpErr.missingIntegratorUserIds;
      const loserKey = integratorUserIdNumericKey(loser);
      const loserOnlyMissing =
        merged.reason === "http" &&
        merged.status === 400 &&
        parsedHttpErr.error === "USER_NOT_FOUND" &&
        Array.isArray(missing) &&
        missing.length === 1 &&
        integratorUserIdNumericKey(missing[0] ?? "") === loserKey;

      if (loserOnlyMissing) {
        if (dryRun) {
          return {
            ok: true,
            status: 200,
            body: {
              ok: true,
              dryRun: true,
              duplicateIntegratorUserMissingInIntegrator: true,
              clearedIntegratorUserId: loser,
            },
          };
        }

        const rowCount = await clearDuplicateIntegratorUserId(client, duplicateId, loser);
        if (rowCount !== 1) {
          try {
            await client.query("ROLLBACK");
          } catch {
            /* no active tx after autocommit UPDATE failure path */
          }
          await recordIntegratorMergeFailure({
            pool,
            actorId,
            targetId,
            duplicateId,
            dryRun: false,
            phase: "orphan_clear_race",
            error: "UPDATE platform_users integrator_user_id clear: rowCount not 1",
          });
          return {
            ok: false,
            status: 409,
            body: {
              ok: false,
              error: "orphan_clear_failed",
              message: "Could not clear duplicate integrator_user_id (row changed?). Retry preview.",
            },
          };
        }

        await client.query("COMMIT");
        const labels = await fetchMergePartyDisplayLabels(pool, targetId, duplicateId);
        await writeAuditLog(pool, {
          actorId,
          action: "integrator_user_merge",
          targetId,
          status: "ok",
          details: {
            targetId,
            duplicateId,
            targetDisplayName: labels.targetDisplayName,
            duplicateDisplayName: labels.duplicateDisplayName,
            phase: "orphan_duplicate_integrator_id_cleared",
            clearedIntegratorUserId: loser,
          },
        });
        logger.info(
          {
            action: "integrator_user_merge",
            phase: "orphan_duplicate_integrator_id_cleared",
            targetId,
            duplicateId,
            clearedIntegratorUserId: loser,
          },
          "[integrator-merge] cleared phantom duplicate integrator_user_id",
        );
        return {
          ok: true,
          status: 200,
          body: {
            ok: true,
            orphanIntegratorIdCleared: true,
            clearedIntegratorUserId: loser,
          },
        };
      }

      const errBody = parseIntegratorMergeHttpDetails(merged.bodyText);
      const http = merged.status >= 400 && merged.status < 600 ? merged.status : 502;
      await recordIntegratorMergeFailure({
        pool,
        actorId,
        targetId,
        duplicateId,
        dryRun,
        phase: "integrator_m2m",
        error: merged.bodyText || `integrator_merge_failed status=${merged.status}`,
        httpStatus: merged.status,
      });
      return {
        ok: false,
        status: http,
        body: {
          ok: false,
          error: "integrator_merge_failed",
          status: merged.status,
          details: errBody,
        },
      };
    }

    await client.query("COMMIT");
    txOpen = false;
    return { ok: true, status: 200, body: { ok: true, result: merged.result } };
  } catch (error) {
    if (txOpen) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore rollback errors */
      }
    }
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(
      { err: msg, action: "integrator_user_merge", targetId, duplicateId },
      "[integrator-merge] unexpected error",
    );
    throw error;
  } finally {
    client.release();
  }
}
