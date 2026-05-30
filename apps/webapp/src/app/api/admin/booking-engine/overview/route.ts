import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { parseBookingSlotsReadSource } from "@/modules/patient-booking/slotsReadSource";
import { requireAdminBookingEngine } from "../_requireAdminBookingEngine";

function parseDoctorAppointmentsReadSource(valueJson: unknown): "rubitime_legacy" | "canonical" {
  if (
    valueJson !== null &&
    typeof valueJson === "object" &&
    "value" in (valueJson as Record<string, unknown>) &&
    (valueJson as { value: unknown }).value === "canonical"
  ) {
    return "canonical";
  }
  if (valueJson === "canonical") return "canonical";
  return "rubitime_legacy";
}

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
