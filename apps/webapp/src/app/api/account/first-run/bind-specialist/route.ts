import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireAdminWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { getCurrentSession } from '@/modules/auth/service';

export async function POST() {
  const session = await getCurrentSession();
  if (session?.user.role === 'admin') {
    return NextResponse.json({ ok: false, error: 'platform_admin_forbidden' }, { status: 403 });
  }
  const gate = await requireAdminWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const { ctx } = gate;
  if (ctx.membershipRole !== 'owner') {
    return NextResponse.json({ ok: false, error: 'owner_required' }, { status: 403 });
  }
  const deps = buildAppDeps();
  const specialistId = await deps.organizationProvisioning.ensureOwnBookableSpecialist({
    organizationId: ctx.organizationId,
    membershipId: ctx.membershipId,
    platformUserId: ctx.session.user.userId,
    membershipRole: ctx.membershipRole,
    specialistId: ctx.specialistId,
    displayName: ctx.session.user.displayName,
  });
  if (!specialistId) {
    return NextResponse.json({ ok: false, error: 'specialist_binding_failed' }, { status: 409 });
  }
  return NextResponse.json({ ok: true, specialistId, redirectTo: '/app/doctor' });
}
