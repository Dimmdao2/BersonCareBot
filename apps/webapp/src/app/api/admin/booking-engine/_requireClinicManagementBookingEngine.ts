import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  requireClinicManagementApiContext,
  type DoctorWorkspaceAccessContext,
} from '@/app-layer/guards/requireRole';
import type { AppSession } from '@/shared/types/session';

type BookingEngineService = NonNullable<ReturnType<typeof buildAppDeps>['bookingEngine']>;

export type AdminBookingEngineContext = {
  session: AppSession;
  service: BookingEngineService;
  organizationId: string;
  membershipId: string;
  membershipRole: DoctorWorkspaceAccessContext['membershipRole'];
  specialistId: string | null;
  canManageOrganization: boolean;
  canManageAllSpecialists: boolean;
};

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
