import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { withExplicitOrganizationPrincipal } from "@/app-layer/principal/withOrganizationPrincipal";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { BookingCity } from "@/modules/booking-catalog/types";
import {
  listInPersonCitiesForOrganization,
  listInPersonServicesForBranch,
  resolveBookableOnlineLocationForOrganization,
  resolveActiveBranchForCity,
  type InPersonServiceListItem,
  type OnlineBookingLocationOption,
} from "@/modules/patient-booking/inPersonServicesCatalog";

export type LoadCitiesResult =
  | { ok: true; cities: BookingCity[]; onlineLocation: OnlineBookingLocationOption | null }
  | { ok: false; error: "catalog_unavailable"; cities: []; onlineLocation: null };

export type LoadInPersonServicesResult =
  | {
      ok: true;
      branchId: string;
      branchTitle: string;
      cityCode: string;
      services: InPersonServiceListItem[];
    }
  | { ok: false; error: "catalog_unavailable" | "city_not_found"; services: [] };

/**
 * Single chokepoint: resolves the canonical public booking link `/book/{publicSlug}` to an
 * organization id (owner canon: `docs/_TODO/SAAS_FOUNDATION/OWNER_RULINGS_2026-07-17.md` §1).
 *
 * Runs under the bootstrap principal (no organization context yet — that is exactly the point:
 * the slug is the only trusted input before any catalog read). Returns `null` uniformly for an
 * unknown slug, an unpublished directory entry, and an inactive organization, so callers must
 * render a single fail-closed 404 without leaking which case occurred (no clinic enumeration).
 */
export async function resolvePublicOrganizationBySlugRsc(slugRaw: string): Promise<{ organizationId: string } | null> {
  stampBootstrapPrincipal("app/book/[slug]:resolve-organization");
  const deps = buildAppDeps();
  if (!deps.clinicDirectory) return null;
  const organizationId = await deps.clinicDirectory.resolveOrganizationIdBySlug(slugRaw);
  if (!organizationId) return null;
  return { organizationId };
}

/** RSC: canonical catalog cities for a slug-resolved, trusted organization. */
export async function loadPublicOrganizationCitiesRsc(organizationId: string): Promise<LoadCitiesResult> {
  const deps = buildAppDeps();
  try {
    const catalog = await withExplicitOrganizationPrincipal(
      { organizationId, source: "app/book/[slug]:load-cities" },
      async () => {
        const [cities, onlineLocation] = await Promise.all([
          listInPersonCitiesForOrganization(deps, organizationId),
          resolveBookableOnlineLocationForOrganization(deps, organizationId),
        ]);
        return { cities, onlineLocation };
      },
    );
    if (!catalog.cities) {
      return { ok: false, error: "catalog_unavailable", cities: [], onlineLocation: null };
    }
    return { ok: true, cities: catalog.cities, onlineLocation: catalog.onlineLocation };
  } catch {
    return { ok: false, error: "catalog_unavailable", cities: [], onlineLocation: null };
  }
}

/** RSC: canonical services for a slug-resolved, trusted organization and city. */
export async function loadPublicOrganizationServicesForCityRsc(
  organizationId: string,
  cityCode: string,
): Promise<LoadInPersonServicesResult> {
  const deps = buildAppDeps();
  if (!deps.bookingEngine) return { ok: false, error: "catalog_unavailable", services: [] };
  try {
    const listed = await withExplicitOrganizationPrincipal(
      { organizationId, source: "app/book/[slug]:load-services" },
      async () => {
        const branch = await resolveActiveBranchForCity(deps, organizationId, cityCode);
        return branch ? listInPersonServicesForBranch(deps, organizationId, branch.id) : null;
      },
    );
    if (!listed) return { ok: false, error: "city_not_found", services: [] };
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
