/**
 * POST /api/doctor/clients/merge — apply manual platform user merge (admin + admin mode).
 * Body: `{ resolution: ManualMergeResolution }` (see `docs/ARCHITECTURE/PLATFORM_USER_MERGE.md`).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/infra/db/client";
import { runManualPlatformUserMerge } from "@/infra/manualPlatformUserMerge";
import { verifyManualMergeIntegratorIntegratorGate } from "@/infra/manualMergeIntegratorGate";
import { requireAdminModeSession } from "@/modules/auth/requireAdminMode";

const winner = z.enum(["target", "duplicate"]);
const winner3 = z.enum(["target", "duplicate", "both"]);

const manualMergeResolutionSchema = z.object({
  targetId: z.string().uuid(),
  duplicateId: z.string().uuid(),
  fields: z.object({
    phone_normalized: winner,
    display_name: winner,
    first_name: winner,
    last_name: winner,
    email: winner,
  }),
  bindings: z.object({
    telegram: winner3,
    max: winner3,
    vk: winner3,
  }),
  oauth: z.record(z.string(), winner).default(() => ({})),
  channelPreferences: z.enum(["keep_target", "keep_newer", "merge"]),
});

const bodySchema = z.object({
  resolution: manualMergeResolutionSchema,
});

export async function POST(request: Request) {
  const adminGate = await requireAdminModeSession();
  if (!adminGate.ok) {
    return adminGate.response;
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const { resolution } = parsed.data;
  const pool = getPool();
  const gate = await verifyManualMergeIntegratorIntegratorGate(pool, resolution.targetId, resolution.duplicateId);
  if (!gate.ok) {
    return gate.response;
  }
  const result = await runManualPlatformUserMerge(pool, adminGate.session.user.userId, resolution, {
    allowDistinctIntegratorUserIds: gate.allowDistinctIntegratorUserIds,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: "merge_failed", message: result.error },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    targetId: result.targetId,
    duplicateId: result.duplicateId,
  });
}
