import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { BookingCity } from "@/modules/booking-catalog/types";
import {
  listInPersonServicesForBranch,
  resolveActiveBranchForCity,
  type InPersonServiceListItem,
} from "@/modules/patient-booking/inPersonServicesCatalog";

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

/** RSC: каталог городов (тот же источник, что `GET /api/booking/catalog/cities`). */
export async function loadBookingCitiesForPatientRsc(): Promise<LoadCitiesResult> {
  const deps = buildAppDeps();
  if (!deps.bookingCatalog) {
    return { ok: false, error: "catalog_unavailable", cities: [] };
  }
  try {
    const cities = await deps.bookingCatalog.listCitiesForPatient();
    return { ok: true, cities };
  } catch {
    return { ok: false, error: "catalog_unavailable", cities: [] };
  }
}

/** RSC: canonical услуги локации по cityCode (первая активная локация города). */
export async function loadInPersonServicesForCityRsc(cityCode: string): Promise<LoadInPersonServicesResult> {
  const deps = buildAppDeps();
  if (!deps.bookingEngine) {
    return { ok: false, error: "catalog_unavailable", services: [] };
  }
  try {
    const organizationId = await deps.bookingEngine.organization.getDefaultOrganizationId();
    const branch = await resolveActiveBranchForCity(deps, organizationId, cityCode);
    if (!branch) {
      return { ok: false, error: "city_not_found", services: [] };
    }
    const listed = await listInPersonServicesForBranch(deps, organizationId, branch.id);
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
