import { NextResponse } from 'next/server';
import { requireDoctorBookingEngine } from '../_requireDoctorBookingEngine';

export async function GET() {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const { service, organizationId } = gate.ctx;
  const services = await service.services.listServices(organizationId);
  return NextResponse.json({ ok: true, services });
}
