import { NextResponse } from 'next/server';
import { loadDoctorSoldMemberships } from '@/app-layer/booking/loadDoctorSoldMemberships';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireEntitlementForRead } from '@/app-layer/guards/requireEntitlement';
import { requireDoctorBookingEngine } from '../../_requireDoctorBookingEngine';

export async function GET() {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForRead(gate.ctx, 'subscriptions');
  if (!entitlement.ok) return entitlement.response;

  const deps = buildAppDeps();
  if (!deps.memberships) {
    return NextResponse.json({ ok: false, error: 'memberships_unavailable' }, { status: 503 });
  }

  const packages = await loadDoctorSoldMemberships({
    doctorClients: deps.doctorClients,
    memberships: deps.memberships,
    organizationId: gate.ctx.organizationId,
    viewerUserId: gate.ctx.session.user.userId,
    visibilityActor: gate.ctx,
  });
  return NextResponse.json({ ok: true, packages });
}
