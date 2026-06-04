import type { OrganizationCatalogPort, ServiceAvailabilityPort } from "@/modules/booking-engine/ports";

export type InPersonServicesCatalogDeps = {
  bookingEngine: {
    catalog: Pick<OrganizationCatalogPort, "listBranches" | "getBranch" | "listSpecialists">;
    services: Pick<
      ServiceAvailabilityPort,
      "listServices" | "listServiceLocationAvailability" | "listSpecialistServiceAvailability"
    >;
  } | null;
};

export type InPersonServiceListItem = {
  id: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  priceMinor: number;
};

export async function resolveActiveBranchForCity(
  deps: InPersonServicesCatalogDeps,
  organizationId: string,
  cityCode: string,
): Promise<{ id: string; title: string; cityCode: string } | null> {
  if (!deps.bookingEngine) return null;
  const normalized = cityCode.trim().toLowerCase();
  if (!normalized) return null;
  const branches = await deps.bookingEngine.catalog.listBranches(organizationId);
  const match = branches
    .filter((b) => b.isActive && b.cityCode.trim().toLowerCase() === normalized)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ru"))[0];
  return match ? { id: match.id, title: match.title, cityCode: match.cityCode } : null;
}

export async function listInPersonServicesForBranch(
  deps: InPersonServicesCatalogDeps,
  organizationId: string,
  branchId: string,
): Promise<{ branch: { id: string; title: string; cityCode: string }; services: InPersonServiceListItem[] } | null> {
  if (!deps.bookingEngine) return null;
  const branch = await deps.bookingEngine.catalog.getBranch(branchId);
  if (!branch || branch.organizationId !== organizationId || !branch.isActive) return null;

  const [services, locationAvailability, specialistAvailability, specialists] = await Promise.all([
    deps.bookingEngine.services.listServices(organizationId),
    deps.bookingEngine.services.listServiceLocationAvailability(organizationId),
    deps.bookingEngine.services.listSpecialistServiceAvailability(organizationId),
    deps.bookingEngine.catalog.listSpecialists(organizationId),
  ]);

  const defaultSpecialist = specialists.find((s) => s.isActive) ?? specialists[0] ?? null;
  const locationServiceIds = new Set(
    locationAvailability
      .filter((r) => r.isActive && r.branchId === branchId)
      .map((r) => r.serviceId),
  );
  const ssaServiceIds = new Set(
    specialistAvailability
      .filter(
        (r) =>
          r.isActive &&
          r.branchId === branchId &&
          (!defaultSpecialist || r.specialistId === defaultSpecialist.id),
      )
      .map((r) => r.serviceId),
  );

  const items = services
    .filter(
      (s) =>
        s.isActive &&
        s.publicWidgetVisible &&
        !s.adminManualOnly &&
        (locationServiceIds.has(s.id) || ssaServiceIds.has(s.id)),
    )
    .map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      durationMinutes: s.durationMinutes,
      priceMinor: s.priceMinor,
    }));

  return {
    branch: { id: branch.id, title: branch.title, cityCode: branch.cityCode },
    services: items,
  };
}
