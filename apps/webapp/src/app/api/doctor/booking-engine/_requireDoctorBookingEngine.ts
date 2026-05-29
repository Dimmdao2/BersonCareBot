import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

type BookingEngineService = NonNullable<ReturnType<typeof buildAppDeps>["bookingEngine"]>;

export type DoctorBookingEngineContext = {
  session: NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>;
  service: BookingEngineService;
  organizationId: string;
};

export async function requireDoctorBookingEngine(): Promise<
  | { ok: true; ctx: DoctorBookingEngineContext }
  | { ok: false; response: NextResponse }
> {
  const session = await getCurrentSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    };
  }
  if (!canAccessDoctor(session.user.role)) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }) };
  }
  const service = buildAppDeps().bookingEngine;
  if (!service) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "booking_engine_unavailable" }, { status: 503 }),
    };
  }
  const organizationId = await service.organization.getDefaultOrganizationId();
  return { ok: true, ctx: { session, service, organizationId } };
}
