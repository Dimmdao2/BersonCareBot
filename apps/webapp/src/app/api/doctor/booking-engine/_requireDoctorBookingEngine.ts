import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  requireOrganizationWorkspaceApiContext,
  type DoctorWorkspaceAccessContext,
} from '@/app-layer/guards/requireRole';

type BookingEngineService = NonNullable<ReturnType<typeof buildAppDeps>['bookingEngine']>;

export type DoctorBookingEngineContext = {
  session: DoctorWorkspaceAccessContext['session'];
  service: BookingEngineService;
  organizationId: string;
  membershipId: string;
  membershipRole: DoctorWorkspaceAccessContext['membershipRole'];
  specialistId: string | null;
  canManageOrganization: boolean;
  canManageAllSpecialists: boolean;
};

export async function requireDoctorBookingEngine(): Promise<
  { ok: true; ctx: DoctorBookingEngineContext } | { ok: false; response: NextResponse }
> {
  const gate = await requireOrganizationWorkspaceApiContext();
  if (!gate.ok) return gate;
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
      session: gate.ctx.session,
      service,
      organizationId: gate.ctx.organizationId,
      membershipId: gate.ctx.membershipId,
      membershipRole: gate.ctx.membershipRole,
      specialistId: gate.ctx.specialistId,
      canManageOrganization: gate.ctx.canManageOrganization,
      canManageAllSpecialists: gate.ctx.canManageAllSpecialists,
    },
  };
}
