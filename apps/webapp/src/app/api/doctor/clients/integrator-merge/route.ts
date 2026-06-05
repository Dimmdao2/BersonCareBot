/**
 * POST /api/doctor/clients/integrator-merge — integrator-side canonical user merge (admin + admin mode).
 * Requires `platform_user_merge_v2_enabled` and HMAC-configured integrator M2M. Run **before** webapp manual merge when both platform users have different integrator_user_id.
 * If integrator returns `USER_NOT_FOUND` and only the duplicate’s (loser) id is missing in integrator.users, clears that `platform_users.integrator_user_id` so the operator can proceed with webapp merge (non–dry-run for the clear; dry-run returns a hint only).
 */
import { NextResponse } from "next/server";
import { getPool } from "@/app-layer/db/client";
import { executeIntegratorPlatformUserMerge } from "@/infra/integratorPlatformUserMerge";
import { integratorMergeBodySchema } from "@/infra/integratorPlatformUserMergeSchemas";
import { requireAdminModeSession } from "@/modules/auth/requireAdminMode";
import { getConfigBool } from "@/modules/system-settings/configAdapter";

export async function POST(request: Request) {
  const adminGate = await requireAdminModeSession();
  if (!adminGate.ok) {
    return adminGate.response;
  }

  const v2 = await getConfigBool("platform_user_merge_v2_enabled", false);
  if (!v2) {
    return NextResponse.json(
      {
        ok: false,
        error: "feature_disabled",
        message: "Enable platform_user_merge_v2_enabled in admin settings first.",
      },
      { status: 400 },
    );
  }

  const raw: unknown = await request.json().catch(() => null);
  const parsed = integratorMergeBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const { targetId, duplicateId, dryRun } = parsed.data;
  if (targetId === duplicateId) {
    return NextResponse.json({ ok: false, error: "same_id" }, { status: 400 });
  }

  const result = await executeIntegratorPlatformUserMerge({
    pool: getPool(),
    actorId: adminGate.session.user.userId,
    targetId,
    duplicateId,
    dryRun,
  });

  return NextResponse.json(result.body, { status: result.status });
}
