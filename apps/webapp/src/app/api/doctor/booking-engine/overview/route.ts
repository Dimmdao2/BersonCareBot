import { NextResponse } from "next/server";
import { requireDoctorBookingEngine } from "../_requireDoctorBookingEngine";

// Read-only doctor overview: the minimal slice the schedule editor («График работы») needs
// to bootstrap (organization title for labels, active branches, specialists). All catalog
// reads are org-scoped via the gate context. No writes, no admin-only config — a doctor may
// read their org's branches/specialists but cannot mutate the catalog here.

export async function GET() {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const { service, organizationId } = gate.ctx;
  const [organization, branches, specialists] = await Promise.all([
    service.organization.getOrganization(organizationId),
    service.catalog.listBranches(organizationId),
    service.catalog.listSpecialists(organizationId),
  ]);
  return NextResponse.json({
    ok: true,
    organizationId,
    organization: organization ? { id: organization.id, title: organization.title } : null,
    branches: branches.map((b) => ({
      id: b.id,
      title: b.title,
      shortTitle: b.shortTitle,
      cityCode: b.cityCode,
      address: b.address,
      timezone: b.timezone,
      isActive: b.isActive,
      sortOrder: b.sortOrder,
    })),
    specialists: specialists.map((s) => ({
      id: s.id,
      fullName: s.fullName,
      isActive: s.isActive,
    })),
  });
}
