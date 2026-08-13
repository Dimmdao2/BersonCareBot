import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireClinicManagementBookingEngine } from '../_requireClinicManagementBookingEngine';

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
    buildAppDeps().clinicDirectory?.getPublishedSlugForOrganization(organizationId) ??
      Promise.resolve(null),
  ]);
  return NextResponse.json({
    ok: true,
    organizationId,
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
  });
}
