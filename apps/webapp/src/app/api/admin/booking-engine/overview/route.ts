import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { parseBookingSlotsReadSource } from "@/modules/patient-booking/slotsReadSource";
import { requireClinicManagementBookingEngine } from "../_requireAdminBookingEngine";

function parseDoctorAppointmentsReadSource(valueJson: unknown): "rubitime_legacy" | "canonical" {
  void valueJson;
  return "canonical";
}

export async function GET() {
  const gate = await requireClinicManagementBookingEngine();
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
    publicSlug,
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
    buildAppDeps().clinicDirectory?.getPublishedSlugForOrganization(organizationId) ?? Promise.resolve(null),
  ]);
  const bridgeEnabled = await service.bridge.isBridgeEnabled();
  const readSourceRow = await buildAppDeps().systemSettings?.getSetting(
    "booking_doctor_appointments_read_source",
    "admin",
  );
  const slotsReadSourceRow = await buildAppDeps().systemSettings?.getSetting(
    "booking_slots_read_source",
    "admin",
  );
  const doctorAppointmentsReadSource = parseDoctorAppointmentsReadSource(readSourceRow?.valueJson ?? null);
  const bookingSlotsReadSource = parseBookingSlotsReadSource(slotsReadSourceRow?.valueJson ?? null);
  return NextResponse.json({
    ok: true,
    organizationId,
    bridgeEnabled,
    doctorAppointmentsReadSource,
    bookingSlotsReadSource,
    calendarReadSource: doctorAppointmentsReadSource,
    organization,
    publicWidget: {
      publicSlug,
      specialists,
      specialistAvailability,
    },
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
