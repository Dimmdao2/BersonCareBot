import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";

type BookingEngineService = NonNullable<ReturnType<typeof buildAppDeps>["bookingEngine"]>;

export type AdminBookingEngineContext = {
  session: NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>;
  service: BookingEngineService;
  organizationId: string;
};

export async function requireAdminBookingEngine(): Promise<
  | { ok: true; ctx: AdminBookingEngineContext }
  | { ok: false; response: NextResponse }
> {
  const session = await getCurrentSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    };
  }
  if (session.user.role !== "admin" || !session.adminMode) {
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
