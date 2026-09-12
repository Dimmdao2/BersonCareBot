import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withPatientOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import type { BookingCity } from '@/modules/booking-catalog/types';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import { resolvePatientTerms, type PatientTerms } from '@/modules/system-settings/patientTerms';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import {
  titleForBookingCityCode,
  type InPersonServiceListItem,
  type OnlineBookingLocationOption,
} from '@/modules/patient-booking/inPersonServicesCatalog';
import type { PatientBookingCatalogRow } from '@/modules/patient-booking/patientBookingCatalog';

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
  | { ok: true; organizationId: string; appDisplayTimeZone: string; terms: PatientTerms }
  | { ok: false; error: 'catalog_unavailable' };

/**
 * Терминология организации для СЕРВЕРНОЙ разметки мастера записи (заголовок шага переноса).
 *
 * Дверь — ТА ЖЕ, что у кабинета клиента: seam `app.read_authenticated_runtime_setting` через
 * `runtimeConfig`, в allowlist которого `appointment_label` и заведён (миграция T-A). Второй
 * пациентской двери настроек (`app.read_current_patient_ui_setting`) этот ключ не известен, и
 * чтение через неё молча вернуло бы «приём» либо упёрлось в отсутствующий грант.
 *
 * Вызывается ВНУТРИ `withPatientOrganizationPrincipal`: seam сверяет запрошенную организацию с
 * принятой принципалом, поэтому чужое слово через него не приходит.
 */
async function readOrganizationTermsUnderPrincipal(
  deps: ReturnType<typeof buildAppDeps>,
  organizationId: string,
): Promise<PatientTerms> {
  const [patientLabel, appointmentLabel] = await Promise.all([
    deps.runtimeConfig.getAuthenticatedString('patient_label', organizationId),
    deps.runtimeConfig.getAuthenticatedString('appointment_label', organizationId),
  ]);
  return resolvePatientTerms({ patientLabel, appointmentLabel });
}

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
      /** Слово организации о событии записи: заголовок шага переноса произносит его сервером. */
      terms: PatientTerms;
      /** Canonical IANA timezone of the branch (`be_branches.timezone`); `null` — not resolvable. */
      branchTimeZone: string | null;
    }
  | { ok: false; error: 'catalog_unavailable' | 'invalid_selection' };

function bookingCitiesFromRows(rows: PatientBookingCatalogRow[]): BookingCity[] {
  const firstByCity = new Map<string, PatientBookingCatalogRow>();
  for (const row of rows) {
    const cityCode = row.cityCode.trim().toLowerCase();
    if (!cityCode || cityCode === 'online') continue;
    const current = firstByCity.get(cityCode);
    if (
      !current ||
      row.branchSortOrder < current.branchSortOrder ||
      (row.branchSortOrder === current.branchSortOrder && row.branchTitle < current.branchTitle)
    ) {
      firstByCity.set(cityCode, row);
    }
  }
  return [...firstByCity.entries()]
    .sort(([, a], [, b]) =>
      a.branchSortOrder - b.branchSortOrder || a.cityCode.localeCompare(b.cityCode))
    .map(([code, row]) => ({
      id: row.branchId,
      code,
      title: titleForBookingCityCode(code),
      isActive: true,
      sortOrder: row.branchSortOrder,
      createdAt: '',
      updatedAt: '',
    }));
}

function onlineLocationFromRows(
  rows: PatientBookingCatalogRow[],
): OnlineBookingLocationOption | null {
  const row = rows.find((item) => item.cityCode.trim().toLowerCase() === 'online');
  return row
    ? { id: row.branchId, cityCode: row.cityCode, title: row.branchTitle }
    : null;
}

function servicesForCityFromRows(rows: PatientBookingCatalogRow[], cityCode: string) {
  const normalized = cityCode.trim().toLowerCase();
  const candidates = rows.filter((row) => row.cityCode.trim().toLowerCase() === normalized);
  const first = candidates.sort((a, b) =>
    a.branchSortOrder - b.branchSortOrder || a.branchTitle.localeCompare(b.branchTitle, 'ru'))[0];
  if (!first) return null;
  const serviceById = new Map<string, PatientBookingCatalogRow>();
  for (const row of candidates) {
    if (row.branchId === first.branchId) serviceById.set(row.serviceId, row);
  }
  const services: InPersonServiceListItem[] = [...serviceById.values()]
    .sort((a, b) =>
      a.serviceSortOrder - b.serviceSortOrder || a.serviceTitle.localeCompare(b.serviceTitle, 'ru'))
    .map((row) => ({
      id: row.serviceId,
      title: row.serviceTitle,
      description: row.serviceDescription,
      durationMinutes: row.durationMinutes,
      priceMinor: row.priceMinor,
    }));
  return {
    branch: { id: first.branchId, title: first.branchTitle, cityCode: first.cityCode },
    services,
  };
}

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
    const settings = await withPatientOrganizationPrincipal(
      {
        organizationId,
        platformUserId,
        source: 'app/patient/booking:load-display-settings',
      },
      async () => ({
        appDisplayTimeZone: await getAppDisplayTimeZone(),
        terms: await readOrganizationTermsUnderPrincipal(deps, organizationId),
      }),
    );
    return { ok: true, organizationId, ...settings };
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
  if (!organizationId || !bookingScheduling) {
    return { ok: false, error: 'catalog_unavailable' };
  }

  try {
    return await withPatientOrganizationPrincipal(
      {
        organizationId,
        platformUserId: input.platformUserId,
        source: 'app/patient/booking:load-slot-context',
      },
      async () => {
        let branchId = input.branchId;
        let serviceId = input.serviceId;
        if (!branchId || !serviceId) {
          return { ok: false, error: 'invalid_selection' } as const;
        }

        const rows = await deps.patientBookingCatalog.listCurrentPatientCatalog();
        const selected = rows.find(
          (row) => row.branchId === branchId && row.serviceId === serviceId,
        );
        if (!selected) {
          return { ok: false, error: 'invalid_selection' } as const;
        }

        const [maxConsecutiveSlotHours, appDisplayTimeZone, canonicalContext, terms] =
          await Promise.all([
            bookingScheduling.getMaxConsecutiveSlotHours(organizationId),
            getAppDisplayTimeZone(),
            // Same canonical scheduling read the create/slots API routes already use to resolve
            // the branch — this only borrows its `branchTimezone` for display, not a new lookup.
            bookingScheduling.resolveCanonicalInPersonContext({
              organizationId,
              branchId,
              serviceId,
            }),
            readOrganizationTermsUnderPrincipal(deps, organizationId),
          ]);

        return {
          ok: true,
          organizationId,
          branchId,
          serviceId,
          cityCode: selected.cityCode,
          cityTitle: titleForBookingCityCode(selected.cityCode),
          serviceTitle: selected.serviceTitle,
          durationMinutes: selected.durationMinutes,
          priceMinor: selected.priceMinor,
          maxConsecutiveSlotHours,
          appDisplayTimeZone,
          branchTimeZone: canonicalContext?.branchTimezone ?? null,
          terms,
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
    const catalog = await withPatientOrganizationPrincipal(
      {
        organizationId,
        platformUserId,
        source: 'app/patient/booking:load-cities',
      },
      async () => {
        const rows = await deps.patientBookingCatalog.listCurrentPatientCatalog();
        return {
          cities: bookingCitiesFromRows(rows),
          onlineLocation: onlineLocationFromRows(rows),
        };
      },
    );
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
  if (!platformUserId || !organizationId) {
    return { ok: false, error: 'catalog_unavailable', services: [] };
  }
  try {
    const listed = await withPatientOrganizationPrincipal(
      {
        organizationId,
        platformUserId,
        source: 'app/patient/booking:load-services',
      },
      async () => {
        const rows = await deps.patientBookingCatalog.listCurrentPatientCatalog();
        return servicesForCityFromRows(rows, cityCode);
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
