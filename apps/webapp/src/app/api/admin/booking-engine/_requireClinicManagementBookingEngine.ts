import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  requireClinicManagementApiContext,
  type DoctorWorkspaceAccessContext,
} from '@/app-layer/guards/requireRole';

type BookingEngineService = NonNullable<ReturnType<typeof buildAppDeps>['bookingEngine']>;

export type AdminBookingEngineContext = DoctorWorkspaceAccessContext & {
  service: BookingEngineService;
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
      ...workspaceGate.ctx,
      service,
    },
  };
}
