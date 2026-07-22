import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { withExplicitOrganizationPrincipal } from "@/app-layer/principal/withOrganizationPrincipal";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { BookingCity } from "@/modules/booking-catalog/types";
import {
  listInPersonCitiesForOrganization,
  listInPersonServicesForBranch,
  resolveBookableOnlineLocationForOrganization,
  resolveActiveBranchForCity,
  titleForBookingCityCode,
  type InPersonServiceListItem,
  type OnlineBookingLocationOption,
} from "@/modules/patient-booking/inPersonServicesCatalog";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";

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

export type LoadPublicInPersonSlotContextResult =
  | {
      ok: true;
      branchId: string;
      serviceId: string;
      cityCode: string;
      cityTitle: string;
      serviceTitle: string;
      durationMinutes: number;
      priceMinor: number;
      maxConsecutiveSlotHours: number;
      appDisplayTimeZone: string;
    }
  | { ok: false };

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

/**
 * Resolves a direct public-widget selection under the published slug's organization principal.
 * URL labels are intentionally discarded: branch/service availability is read from canonical
 * catalog and scheduling state before the slot page receives display metadata.
 */
export async function loadPublicInPersonSlotContextForSlugRsc(input: {
  orgSlug: string;
  branchId: string;
  serviceId: string;
}): Promise<LoadPublicInPersonSlotContextResult> {
  const resolved = await resolvePublicOrganizationBySlugRsc(input.orgSlug);
  const deps = buildAppDeps();
  if (!resolved || !deps.bookingEngine || !deps.bookingScheduling) return { ok: false };
  try {
    return await withExplicitOrganizationPrincipal(
      { organizationId: resolved.organizationId, source: "app/book:load-direct-slot-context" },
      async () => {
        const listed = await listInPersonServicesForBranch(deps, resolved.organizationId, input.branchId);
        const service = listed?.services.find((item) => item.id === input.serviceId);
        if (!listed || !service) return { ok: false } as const;
        const context = await deps.bookingScheduling!.resolveCanonicalInPersonContext({
          organizationId: resolved.organizationId,
          branchId: input.branchId,
          serviceId: input.serviceId,
        });
        if (
          !context ||
          context.organizationId !== resolved.organizationId ||
          context.branchId !== input.branchId ||
          context.serviceId !== input.serviceId
        ) {
          return { ok: false } as const;
        }
        const [maxConsecutiveSlotHours, appDisplayTimeZone] = await Promise.all([
          deps.bookingScheduling!.getMaxConsecutiveSlotHours(resolved.organizationId),
          getAppDisplayTimeZone(),
        ]);
        return {
          ok: true,
          branchId: context.branchId,
          serviceId: context.serviceId,
          cityCode: listed.branch.cityCode,
          cityTitle: titleForBookingCityCode(listed.branch.cityCode),
          serviceTitle: service.title,
          durationMinutes: context.durationMinutes,
          priceMinor: service.priceMinor,
          maxConsecutiveSlotHours,
          appDisplayTimeZone,
        } as const;
      },
    );
  } catch {
    return { ok: false };
  }
}
