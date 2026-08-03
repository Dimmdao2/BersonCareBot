import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withExplicitOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import type { BookingCity } from '@/modules/booking-catalog/types';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import {
  listInPersonCitiesForOrganization,
  listInPersonServicesForBranch,
  resolveBookableOnlineLocationForOrganization,
  resolveActiveBranchForCity,
  titleForBookingCityCode,
  type InPersonServiceListItem,
  type OnlineBookingLocationOption,
} from '@/modules/patient-booking/inPersonServicesCatalog';

type PatientOrganizationServiceLike = {
  resolveActiveOrganizationForPatient(
    platformUserId: string,
    options?: { rememberedOrganizationId?: string | null },
  ): Promise<
    { ok: true; organizationId: string } | { ok: false; reason: string; organizationIds?: string[] }
  >;
};

export type LoadCitiesResult =
  | { ok: true; cities: BookingCity[]; onlineLocation: OnlineBookingLocationOption | null }
  | { ok: false; error: 'catalog_unavailable'; cities: []; onlineLocation: null };

export type LoadInPersonServicesResult =
  | {
      ok: true;
      branchId: string;
      branchTitle: string;
      cityCode: string;
      services: InPersonServiceListItem[];
    }
  | { ok: false; error: 'catalog_unavailable' | 'city_not_found'; services: [] };

export type LoadPatientBookingDisplaySettingsResult =
  | { ok: true; organizationId: string; appDisplayTimeZone: string }
  | { ok: false; error: 'catalog_unavailable' };

export type LoadInPersonSlotContextResult =
  | {
      ok: true;
      organizationId: string;
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
  | { ok: false; error: 'catalog_unavailable' | 'invalid_selection' };

export async function resolvePatientOrganizationIdForRsc(
  deps: { patientOrganization: PatientOrganizationServiceLike | null },
  platformUserId: string | undefined,
): Promise<string | null> {
  if (!platformUserId || !deps.patientOrganization) return null;
  const rememberedOrganizationId = getCurrentDbPrincipalOrganizationId() ?? null;
  const resolved = await deps.patientOrganization.resolveActiveOrganizationForPatient(
    platformUserId,
    {
      rememberedOrganizationId,
    },
  );
  return resolved.ok ? resolved.organizationId : null;
}

/** RSC: organization-owned display settings for an authenticated patient booking flow. */
export async function loadPatientBookingDisplaySettingsRsc(
  platformUserId: string,
): Promise<LoadPatientBookingDisplaySettingsResult> {
  const deps = buildAppDeps();
  const organizationId = await resolvePatientOrganizationIdForRsc(deps, platformUserId);
  if (!organizationId) return { ok: false, error: 'catalog_unavailable' };
  try {
    const appDisplayTimeZone = await withExplicitOrganizationPrincipal(
      { organizationId, source: 'app/patient/booking:load-display-settings' },
      () => getAppDisplayTimeZone(),
    );
    return { ok: true, organizationId, appDisplayTimeZone };
  } catch {
    return { ok: false, error: 'catalog_unavailable' };
  }
}

/**
 * RSC: validate an authenticated patient's in-person selection and resolve the
 * canonical slot context without trusting query-string catalog data.
 */
export async function loadInPersonSlotContextForPatientRsc(input: {
  platformUserId: string;
  branchId?: string;
  serviceId?: string;
}): Promise<LoadInPersonSlotContextResult> {
  const deps = buildAppDeps();
  const organizationId = await resolvePatientOrganizationIdForRsc(deps, input.platformUserId);
  const bookingScheduling = deps.bookingScheduling;
  if (!organizationId || !deps.bookingEngine || !bookingScheduling) {
    return { ok: false, error: 'catalog_unavailable' };
  }

  try {
    return await withExplicitOrganizationPrincipal(
      { organizationId, source: 'app/patient/booking:load-slot-context' },
      async () => {
        let branchId = input.branchId;
        let serviceId = input.serviceId;
        if (!branchId || !serviceId) {
          return { ok: false, error: 'invalid_selection' } as const;
        }

        const listed = await listInPersonServicesForBranch(deps, organizationId, branchId);
        const service = listed?.services.find((item) => item.id === serviceId);
        if (!listed || !service) {
          return { ok: false, error: 'invalid_selection' } as const;
        }

        const context = await bookingScheduling.resolveCanonicalInPersonContext({
          organizationId,
          branchId,
          serviceId,
        });
        if (
          !context ||
          context.organizationId !== organizationId ||
          context.branchId !== branchId ||
          context.serviceId !== serviceId
        ) {
          return { ok: false, error: 'invalid_selection' } as const;
        }

        const [maxConsecutiveSlotHours, appDisplayTimeZone] = await Promise.all([
          bookingScheduling.getMaxConsecutiveSlotHours(organizationId),
          getAppDisplayTimeZone(),
        ]);

        return {
          ok: true,
          organizationId,
          branchId,
          serviceId,
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
    return { ok: false, error: 'catalog_unavailable' };
  }
}

/** RSC: canonical catalog cities for an authenticated patient organization. */
export async function loadBookingCitiesForPatientRsc(
  platformUserId: string,
): Promise<LoadCitiesResult> {
  const deps = buildAppDeps();
  const organizationId = await resolvePatientOrganizationIdForRsc(deps, platformUserId);
  if (!organizationId) {
    return { ok: false, error: 'catalog_unavailable', cities: [], onlineLocation: null };
  }
  try {
    const catalog = await withExplicitOrganizationPrincipal(
      { organizationId, source: 'app/patient/booking:load-cities' },
      async () => {
        const [cities, onlineLocation] = await Promise.all([
          listInPersonCitiesForOrganization(deps, organizationId),
          resolveBookableOnlineLocationForOrganization(deps, organizationId),
        ]);
        return { cities, onlineLocation };
      },
    );
    if (!catalog.cities) {
      return { ok: false, error: 'catalog_unavailable', cities: [], onlineLocation: null };
    }
    return { ok: true, cities: catalog.cities, onlineLocation: catalog.onlineLocation };
  } catch {
    return { ok: false, error: 'catalog_unavailable', cities: [], onlineLocation: null };
  }
}

/** RSC: canonical services for an authenticated patient organization and city. */
export async function loadInPersonServicesForCityRsc(
  cityCode: string,
  platformUserId?: string,
): Promise<LoadInPersonServicesResult> {
  const deps = buildAppDeps();
  const organizationId = await resolvePatientOrganizationIdForRsc(deps, platformUserId);
  if (!deps.bookingEngine || !organizationId) {
    return { ok: false, error: 'catalog_unavailable', services: [] };
  }
  try {
    const listed = await withExplicitOrganizationPrincipal(
      { organizationId, source: 'app/patient/booking:load-services' },
      async () => {
        const branch = await resolveActiveBranchForCity(deps, organizationId, cityCode);
        return branch ? listInPersonServicesForBranch(deps, organizationId, branch.id) : null;
      },
    );
    if (!listed) {
      return { ok: false, error: 'city_not_found', services: [] };
    }
    return {
      ok: true,
      branchId: listed.branch.id,
      branchTitle: listed.branch.title,
      cityCode: listed.branch.cityCode,
      services: listed.services,
    };
  } catch {
    return { ok: false, error: 'catalog_unavailable', services: [] };
  }
}
