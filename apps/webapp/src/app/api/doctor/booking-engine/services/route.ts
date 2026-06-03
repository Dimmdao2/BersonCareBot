import { NextResponse } from "next/server";
import { requireDoctorBookingEngine } from "../_requireDoctorBookingEngine";

export async function GET() {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const services = await gate.ctx.service.services.listServices(gate.ctx.organizationId);
  return NextResponse.json({ ok: true, services });
}
