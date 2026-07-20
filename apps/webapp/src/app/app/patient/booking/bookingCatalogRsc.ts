import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { withExplicitOrganizationPrincipal } from "@/app-layer/principal/withOrganizationPrincipal";
import type { BookingCity } from "@/modules/booking-catalog/types";
import { getCurrentDbPrincipalOrganizationId } from "@bersoncare/db-principal";
import {
  listInPersonCitiesForOrganization,
  listInPersonServicesForBranch,
  resolveActiveBranchForCity,
  type InPersonServiceListItem,
} from "@/modules/patient-booking/inPersonServicesCatalog";

type PatientOrganizationServiceLike = {
  resolveActiveOrganizationForPatient(
    platformUserId: string,
    options?: { rememberedOrganizationId?: string | null },
  ): Promise<
    | { ok: true; organizationId: string }
    | { ok: false; reason: string; organizationIds?: string[] }
  >;
};

export type LoadCitiesResult =
  | { ok: true; cities: BookingCity[] }
  | { ok: false; error: "catalog_unavailable"; cities: [] };

export type LoadInPersonServicesResult =
  | {
      ok: true;
      branchId: string;
      branchTitle: string;
      cityCode: string;
      services: InPersonServiceListItem[];
    }
  | { ok: false; error: "catalog_unavailable" | "city_not_found"; services: [] };

async function resolvePatientOrganizationId(
  deps: { patientOrganization: PatientOrganizationServiceLike | null },
  platformUserId: string | undefined,
): Promise<string | null> {
  if (!platformUserId || !deps.patientOrganization) return null;
  const rememberedOrganizationId = getCurrentDbPrincipalOrganizationId() ?? null;
  const resolved = await deps.patientOrganization.resolveActiveOrganizationForPatient(platformUserId, {
    rememberedOrganizationId,
  });
  return resolved.ok ? resolved.organizationId : null;
}

/** RSC: canonical catalog cities for an authenticated patient organization. */
export async function loadBookingCitiesForPatientRsc(platformUserId: string): Promise<LoadCitiesResult> {
  const deps = buildAppDeps();
  const organizationId = await resolvePatientOrganizationId(deps, platformUserId);
  if (!organizationId) {
    return { ok: false, error: "catalog_unavailable", cities: [] };
  }
  try {
    const cities = await withExplicitOrganizationPrincipal(
      { organizationId, source: "app/patient/booking:load-cities" },
      () => listInPersonCitiesForOrganization(deps, organizationId),
    );
    if (!cities) return { ok: false, error: "catalog_unavailable", cities: [] };
    return { ok: true, cities };
  } catch {
    return { ok: false, error: "catalog_unavailable", cities: [] };
  }
}

/** RSC: canonical services for an authenticated patient organization and city. */
export async function loadInPersonServicesForCityRsc(
  cityCode: string,
  platformUserId?: string,
): Promise<LoadInPersonServicesResult> {
  const deps = buildAppDeps();
  const organizationId = await resolvePatientOrganizationId(deps, platformUserId);
  if (!deps.bookingEngine || !organizationId) {
    return { ok: false, error: "catalog_unavailable", services: [] };
  }
  try {
    const listed = await withExplicitOrganizationPrincipal(
      { organizationId, source: "app/patient/booking:load-services" },
      async () => {
        const branch = await resolveActiveBranchForCity(deps, organizationId, cityCode);
        return branch ? listInPersonServicesForBranch(deps, organizationId, branch.id) : null;
      },
    );
    if (!listed) {
      return { ok: false, error: "city_not_found", services: [] };
    }
    return {
      ok: true,
      branchId: listed.branch.id,
      branchTitle: listed.branch.title,
      cityCode: listed.branch.cityCode,
      services: listed.services,
    };
  } catch {
    return { ok: false, error: "catalog_unavailable", services: [] };
  }
}
