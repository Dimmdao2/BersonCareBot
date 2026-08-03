import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { getCurrentSession } from '@/modules/auth/service';
import {
  requireClinicManagementApiContext,
  requireDoctorWorkspaceApiContext,
  type DoctorWorkspaceAccessContext,
} from '@/app-layer/guards/requireRole';

type BookingEngineService = NonNullable<ReturnType<typeof buildAppDeps>['bookingEngine']>;

export type AdminBookingEngineContext = {
  session: NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>;
  service: BookingEngineService;
  organizationId: string;
  membershipId: string;
  membershipRole: DoctorWorkspaceAccessContext['membershipRole'];
  specialistId: string | null;
  canManageOrganization: boolean;
  canManageAllSpecialists: boolean;
};

export async function requireAdminBookingEngine(): Promise<
  { ok: true; ctx: AdminBookingEngineContext } | { ok: false; response: NextResponse }
> {
  const session = await getCurrentSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
    };
  }
  if (session.user.role !== 'admin') {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 }),
    };
  }
  const workspaceGate = await requireDoctorWorkspaceApiContext();
  if (!workspaceGate.ok) return workspaceGate;
  const service = buildAppDeps().bookingEngine;
  if (!service) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: 'booking_engine_unavailable' },
        { status: 503 },
      ),
    };
  }
  return {
    ok: true,
    ctx: {
      session,
      service,
      organizationId: workspaceGate.ctx.organizationId,
      membershipId: workspaceGate.ctx.membershipId,
      membershipRole: workspaceGate.ctx.membershipRole,
      specialistId: workspaceGate.ctx.specialistId,
      canManageOrganization: workspaceGate.ctx.canManageOrganization,
      canManageAllSpecialists: workspaceGate.ctx.canManageAllSpecialists,
    },
  };
}

export async function requireClinicManagementBookingEngine(): Promise<
  { ok: true; ctx: AdminBookingEngineContext } | { ok: false; response: NextResponse }
> {
  const workspaceGate = await requireClinicManagementApiContext();
  if (!workspaceGate.ok) return workspaceGate;
  const service = buildAppDeps().bookingEngine;
  if (!service) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: 'booking_engine_unavailable' },
        { status: 503 },
      ),
    };
  }
  return {
    ok: true,
    ctx: {
      session: workspaceGate.ctx.session,
      service,
      organizationId: workspaceGate.ctx.organizationId,
      membershipId: workspaceGate.ctx.membershipId,
      membershipRole: workspaceGate.ctx.membershipRole,
      specialistId: workspaceGate.ctx.specialistId,
      canManageOrganization: workspaceGate.ctx.canManageOrganization,
      canManageAllSpecialists: workspaceGate.ctx.canManageAllSpecialists,
    },
  };
}
