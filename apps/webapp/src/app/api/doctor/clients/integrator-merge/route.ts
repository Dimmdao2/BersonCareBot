/**
 * POST /api/doctor/clients/integrator-merge — integrator-side canonical user merge (admin + admin mode).
 * Requires `platform_user_merge_v2_enabled` and HMAC-configured integrator M2M. Run **before** webapp manual merge when both platform users have different integrator_user_id.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { callIntegratorUserMerge } from "@/infra/integrations/integratorUserMergeM2mClient";
import { getPool } from "@/infra/db/client";
import { requireAdminModeSession } from "@/modules/auth/requireAdminMode";
import { getConfigBool } from "@/modules/system-settings/configAdapter";

const bodySchema = z.object({
  targetId: z.string().uuid(),
  duplicateId: z.string().uuid(),
  dryRun: z.boolean().optional(),
});

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
      return NextResponse.json({ ok: false, error: "missing_user" }, { status: 404 });
    }
    const byId = new Map(r.rows.map((row) => [row.id, row]));
    const tRow = byId.get(targetId);
    const dRow = byId.get(duplicateId);
    if (!tRow || !dRow) {
      await client.query("ROLLBACK");
      txOpen = false;
      return NextResponse.json({ ok: false, error: "missing_user" }, { status: 404 });
    }
    if (tRow.role !== "client" || dRow.role !== "client") {
      await client.query("ROLLBACK");
      txOpen = false;
      return NextResponse.json({ ok: false, error: "not_client" }, { status: 400 });
    }
    if (tRow.merged_into_id != null || dRow.merged_into_id != null) {
      await client.query("ROLLBACK");
      txOpen = false;
      return NextResponse.json({ ok: false, error: "alias_not_allowed" }, { status: 409 });
    }

    const winner = tRow.integrator_user_id?.trim() || "";
    const loser = dRow.integrator_user_id?.trim() || "";
    if (!winner || !loser || winner === loser) {
      await client.query("ROLLBACK");
      txOpen = false;
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
        return NextResponse.json(
          { ok: false, error: "integrator_unconfigured", message: "INTEGRATOR_API_URL or webhook secret missing." },
          { status: 503 },
        );
      }
      if (merged.reason === "timeout") {
        return NextResponse.json(
          { ok: false, error: "integrator_timeout", message: "Integrator merge request timed out." },
          { status: 503 },
        );
      }
      let errBody: unknown = merged.bodyText;
      try {
        errBody = JSON.parse(merged.bodyText) as unknown;
      } catch {
        /* keep text */
      }
      return NextResponse.json(
        { ok: false, error: "integrator_merge_failed", status: merged.status, details: errBody },
        { status: merged.status >= 400 && merged.status < 600 ? merged.status : 502 },
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
    throw error;
  } finally {
    client.release();
  }
}
