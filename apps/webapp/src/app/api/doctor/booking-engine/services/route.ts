import { NextResponse } from "next/server";
import { requireDoctorBookingEngine } from "../_requireDoctorBookingEngine";

export async function GET() {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const { service, organizationId } = gate.ctx;
  const [services, locationAvailability] = await Promise.all([
    service.services.listServices(organizationId),
    service.services.listServiceLocationAvailability(organizationId),
  ]);
  return NextResponse.json({ ok: true, services, locationAvailability });
}
