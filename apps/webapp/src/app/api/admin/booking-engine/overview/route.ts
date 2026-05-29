import { NextResponse } from "next/server";
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
  return NextResponse.json({
    ok: true,
    organizationId,
    bridgeEnabled,
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
