import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { parseDoctorAppointmentsReadSource } from "@/infra/repos/doctorAppointmentsReadSwitch";
import { requireAdminBookingEngine } from "../_requireAdminBookingEngine";

export async function GET() {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const { service, organizationId } = gate.ctx;
  const [
    organization,
    branches,
    rooms,
    specialists,
    services,
    specialistAvailability,
    locationAvailability,
    specialistRooms,
    mapping,
  ] = await Promise.all([
    service.organization.getOrganization(organizationId),
    service.catalog.listBranches(organizationId),
    service.catalog.listRooms(organizationId),
    service.catalog.listSpecialists(organizationId),
    service.services.listServices(organizationId),
    service.services.listSpecialistServiceAvailability(organizationId),
    service.services.listServiceLocationAvailability(organizationId),
    service.catalog.listSpecialistRooms(organizationId),
    service.bridge.getMappingSummary(organizationId),
  ]);
  const bridgeEnabled = await service.bridge.isBridgeEnabled();
  const readSourceRow = await buildAppDeps().systemSettings?.getSetting(
    "booking_doctor_appointments_read_source",
    "admin",
  );
  const doctorAppointmentsReadSource = parseDoctorAppointmentsReadSource(readSourceRow?.value);
  return NextResponse.json({
    ok: true,
    organizationId,
    bridgeEnabled,
    doctorAppointmentsReadSource,
    organization,
    branches,
    rooms,
    specialists,
    services,
    specialistAvailability,
    locationAvailability,
    specialistRooms,
    mapping,
  });
}
