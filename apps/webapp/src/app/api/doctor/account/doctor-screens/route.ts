/**
 * PATCH /api/doctor/account/doctor-screens — owner/admin toggles its OWN clinical-workspace
 * screens on/off (VISIBILITY_MODEL_DESIGN_2026-08-04.md §5). Scoped to the caller's own resolved
 * membership row (`ctx.membershipId`), never a client-supplied id, so it cannot touch anyone
 * else's row. Deliberately gated on organization.management (not clinical.workspace) so an admin
 * who has already disabled its own screens can still reach this endpoint to turn them back on.
 */
import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireAdminWorkspaceApiContext } from '@/app-layer/guards/requireRole';

export async function PATCH(req: Request) {
  const guard = await requireAdminWorkspaceApiContext();
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  if (ctx.specialistId == null) {
    return NextResponse.json({ ok: false, error: 'no_specialist_binding' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const disabled = (body as Record<string, unknown>)?.disabled;
  if (typeof disabled !== 'boolean') {
    return NextResponse.json({ ok: false, error: 'invalid_disabled' }, { status: 400 });
  }

  await buildAppDeps().organizationMembership.setOwnDoctorScreensDisabled({
    membershipId: ctx.membershipId,
    disabled,
  });

  return NextResponse.json({ ok: true, disabled });
}
