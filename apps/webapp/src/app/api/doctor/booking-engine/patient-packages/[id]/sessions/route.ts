import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { membershipErrorResponse } from '@/app/api/booking-engine/patientPackagesRouteShared';
import { requireDoctorBookingEngine } from '../../../_requireDoctorBookingEngine';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const includePast = new URL(request.url).searchParams.get('includePast') === 'true';
  const deps = buildAppDeps();
  if (!deps.memberships) {
    return NextResponse.json({ ok: false, error: 'memberships_unavailable' }, { status: 503 });
  }
  try {
    const sessions = await deps.memberships.listPatientPackageSessions(
      id,
      gate.ctx.organizationId,
      {
        includePast,
      },
    );
    return NextResponse.json({ ok: true, sessions });
  } catch (err) {
    return membershipErrorResponse(err);
  }
}
