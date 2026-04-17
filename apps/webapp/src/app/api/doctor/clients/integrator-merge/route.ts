/**
 * POST /api/doctor/clients/integrator-merge — integrator-side canonical user merge (admin + admin mode).
 * Requires `platform_user_merge_v2_enabled` and HMAC-configured integrator M2M. Run **before** webapp manual merge when both platform users have different integrator_user_id.
 * If integrator returns `USER_NOT_FOUND` and only the duplicate’s (loser) id is missing in integrator.users, clears that `platform_users.integrator_user_id` so the operator can proceed with webapp merge (non–dry-run for the clear; dry-run returns a hint only).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Pool } from "pg";
import { callIntegratorUserMerge } from "@/app-layer/integrations/integratorUserMergeM2mClient";
import { writeAuditLog } from "@/app-layer/admin/auditLog";
import { getPool } from "@/app-layer/db/client";
import { logger } from "@/app-layer/logging/logger";
import { fetchMergePartyDisplayLabels } from "@/app-layer/merge/mergeAuditLabels";
import { requireAdminModeSession } from "@/modules/auth/requireAdminMode";
import { getConfigBool } from "@/modules/system-settings/configAdapter";

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

const bodySchema = z.object({
  targetId: z.string().uuid(),
  duplicateId: z.string().uuid(),
  dryRun: z.boolean().optional(),
});

function integratorUserIdNumericKey(id: string): string {
  return String(BigInt(id.trim()));
}

export async function POST(request: Request) {
  const adminGate = await requireAdminModeSession();
  if (!adminGate.ok) {
    return adminGate.response;
  }

  const v2 = await getConfigBool("platform_user_merge_v2_enabled", false);
  if (!v2) {
    return NextResponse.json(
      { ok: false, error: "feature_disabled", message: "Enable platform_user_merge_v2_enabled in admin settings first." },
      { status: 400 },
    );
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const { targetId, duplicateId, dryRun } = parsed.data;
  if (targetId === duplicateId) {
    return NextResponse.json({ ok: false, error: "same_id" }, { status: 400 });
  }

  const actorId = adminGate.session.user.userId;
  const pool = getPool();
  const client = await pool.connect();
  let txOpen = false;
  try {
    await client.query("BEGIN");
    txOpen = true;
    const r = await client.query<{
      id: string;
      role: string;
      merged_into_id: string | null;
      integrator_user_id: string | null;
    }>(
      `SELECT id::text AS id, role, merged_into_id::text AS merged_into_id, integrator_user_id::text AS integrator_user_id
       FROM platform_users
       WHERE id IN ($1::uuid, $2::uuid)
       ORDER BY id
       FOR UPDATE`,
      [targetId, duplicateId],
    );
    if (r.rows.length !== 2) {
      await client.query("ROLLBACK");
      txOpen = false;
      await recordIntegratorMergeFailure({
        pool,
        actorId,
        targetId,
        duplicateId,
        dryRun: dryRun === true,
        phase: "precheck_missing_user",
        error: "missing_user",
      });
      return NextResponse.json({ ok: false, error: "missing_user" }, { status: 404 });
    }
    const byId = new Map(r.rows.map((row) => [row.id, row]));
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
        dryRun: dryRun === true,
        phase: "precheck_missing_user",
        error: "missing_user",
      });
      return NextResponse.json({ ok: false, error: "missing_user" }, { status: 404 });
    }
    if (tRow.role !== "client" || dRow.role !== "client") {
      await client.query("ROLLBACK");
      txOpen = false;
      await recordIntegratorMergeFailure({
        pool,
        actorId,
        targetId,
        duplicateId,
        dryRun: dryRun === true,
        phase: "precheck_role",
        error: "not_client",
      });
      return NextResponse.json({ ok: false, error: "not_client" }, { status: 400 });
    }
    if (tRow.merged_into_id != null || dRow.merged_into_id != null) {
      await client.query("ROLLBACK");
      txOpen = false;
      await recordIntegratorMergeFailure({
        pool,
        actorId,
        targetId,
        duplicateId,
        dryRun: dryRun === true,
        phase: "precheck_merged_alias",
        error: "alias_not_allowed",
      });
      return NextResponse.json({ ok: false, error: "alias_not_allowed" }, { status: 409 });
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
        dryRun: dryRun === true,
        phase: "precheck_integrator_ids",
        error: "integrator_ids_not_divergent",
      });
      return NextResponse.json(
        {
          ok: false,
          error: "integrator_ids_not_divergent",
          message: "Both platform users must have different non-null integrator_user_id for integrator merge.",
        },
        { status: 400 },
      );
    }

    // Keep the row lock until the M2M request is decided so winner/loser ids cannot drift mid-request.
    const merged = await callIntegratorUserMerge({
      winnerIntegratorUserId: winner,
      loserIntegratorUserId: loser,
      dryRun: dryRun === true,
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
          dryRun: dryRun === true,
          phase: "integrator_unconfigured",
          error: "integrator_unconfigured",
        });
        return NextResponse.json(
          { ok: false, error: "integrator_unconfigured", message: "INTEGRATOR_API_URL or webhook secret missing." },
          { status: 503 },
        );
      }
      if (merged.reason === "timeout") {
        await recordIntegratorMergeFailure({
          pool,
          actorId,
          targetId,
          duplicateId,
          dryRun: dryRun === true,
          phase: "integrator_timeout",
          error: "integrator_timeout",
        });
        return NextResponse.json(
          { ok: false, error: "integrator_timeout", message: "Integrator merge request timed out." },
          { status: 503 },
        );
      }
      let parsedHttpErr: { error?: string; missingIntegratorUserIds?: string[] } = {};
      try {
        parsedHttpErr = JSON.parse(merged.bodyText) as typeof parsedHttpErr;
      } catch {
        /* keep empty */
      }
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
        if (dryRun === true) {
          await client.query("ROLLBACK");
          txOpen = false;
          return NextResponse.json({
            ok: true,
            dryRun: true,
            duplicateIntegratorUserMissingInIntegrator: true,
            clearedIntegratorUserId: loser,
          });
        }
        const up = await client.query(
          `UPDATE platform_users SET integrator_user_id = NULL WHERE id = $1::uuid AND integrator_user_id = $2::bigint`,
          [duplicateId, loser],
        );
        if (up.rowCount !== 1) {
          await client.query("ROLLBACK");
          txOpen = false;
          await recordIntegratorMergeFailure({
            pool,
            actorId,
            targetId,
            duplicateId,
            dryRun: false,
            phase: "orphan_clear_race",
            error: "UPDATE platform_users integrator_user_id clear: rowCount not 1",
          });
          return NextResponse.json(
            { ok: false, error: "orphan_clear_failed", message: "Could not clear duplicate integrator_user_id (row changed?). Retry preview." },
            { status: 409 },
          );
        }
        await client.query("COMMIT");
        txOpen = false;
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
        return NextResponse.json({
          ok: true,
          orphanIntegratorIdCleared: true,
          clearedIntegratorUserId: loser,
        });
      }

      let errBody: unknown = merged.bodyText;
      try {
        errBody = JSON.parse(merged.bodyText) as unknown;
      } catch {
        /* keep text */
      }
      const http = merged.status >= 400 && merged.status < 600 ? merged.status : 502;
      await recordIntegratorMergeFailure({
        pool,
        actorId,
        targetId,
        duplicateId,
        dryRun: dryRun === true,
        phase: "integrator_m2m",
        error: merged.bodyText || `integrator_merge_failed status=${merged.status}`,
        httpStatus: merged.status,
      });
      return NextResponse.json(
        { ok: false, error: "integrator_merge_failed", status: merged.status, details: errBody },
        { status: http },
      );
    }

    await client.query("COMMIT");
    txOpen = false;
    return NextResponse.json({ ok: true, result: merged.result });
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
