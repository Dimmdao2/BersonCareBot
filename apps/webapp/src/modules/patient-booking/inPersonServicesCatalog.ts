import type {
  OrganizationCatalogPort,
  ServiceAvailabilityPort,
} from '@/modules/booking-engine/ports';
import type { BookingCity } from '@/modules/booking-catalog/types';
import {
  findBuiltInOnlineLocation,
  isBuiltInOnlineLocation,
} from '@/modules/booking-engine/onlineLocation';

export type InPersonServicesCatalogDeps = {
  bookingEngine: {
    catalog: Pick<OrganizationCatalogPort, 'listBranches' | 'getBranch' | 'listSpecialists'>;
    services: Pick<ServiceAvailabilityPort, 'listServices' | 'listSpecialistServiceAvailability'>;
  } | null;
};

export type InPersonServiceListItem = {
  id: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  priceMinor: number;
};

export type OnlineBookingLocationOption = {
  id: string;
  cityCode: string;
  title: string;
};

export function titleForBookingCityCode(cityCode: string): string {
  const normalized = cityCode.trim().toLowerCase();
  if (normalized === 'online') return 'Онлайн';
  if (normalized === 'moscow') return 'Москва';
  if (normalized === 'spb') return 'Санкт-Петербург';
  return cityCode;
}

export async function listInPersonCitiesForOrganization(
  deps: InPersonServicesCatalogDeps,
  organizationId: string,
): Promise<BookingCity[] | null> {
  if (!deps.bookingEngine) return null;
  const branches = await deps.bookingEngine.catalog.listBranches(organizationId);
  const firstByCity = new Map<string, { id: string; cityCode: string; sortOrder: number }>();
  for (const branch of branches) {
    if (!branch.isActive || isBuiltInOnlineLocation(branch)) continue;
    const code = branch.cityCode.trim().toLowerCase();
    if (!code) continue;
    const current = firstByCity.get(code);
    if (!current || branch.sortOrder < current.sortOrder) {
      firstByCity.set(code, { id: branch.id, cityCode: code, sortOrder: branch.sortOrder });
    }
  }
  return Array.from(firstByCity.values())
    .sort((a, b) => a.sortOrder - b.sortOrder || a.cityCode.localeCompare(b.cityCode))
    .map((city) => ({
      id: city.id,
      code: city.cityCode,
      title: titleForBookingCityCode(city.cityCode),
      isActive: true,
      sortOrder: city.sortOrder,
      createdAt: '',
      updatedAt: '',
    }));
}

/**
 * Returns the built-in Online choice only when this exact organization has the location enabled
 * and at least one public service assigned to an active specialist at that location.
 */
export async function resolveBookableOnlineLocationForOrganization(
  deps: InPersonServicesCatalogDeps,
  organizationId: string,
): Promise<OnlineBookingLocationOption | null> {
  if (!deps.bookingEngine) return null;
  const branches = await deps.bookingEngine.catalog.listBranches(organizationId);
  const branch = findBuiltInOnlineLocation(branches, organizationId);
  if (!branch?.isActive) return null;
  const catalog = await listInPersonServicesForBranch(deps, organizationId, branch.id);
  if (!catalog || catalog.services.length === 0) return null;
  return { id: branch.id, cityCode: branch.cityCode, title: branch.title };
}

export type BookableBranchOption = {
  id: string;
  title: string;
  cityCode: string;
  cityTitle: string;
  sortOrder: number;
};

/**
 * Активные очные филиалы организации — ПЕРВЫЙ экран публичной записи.
 *
 * До 19.08 первым экраном стоял ГОРОД, а филиал выбирался за посетителя: `resolveActiveBranchForCity`
 * брала активные филиалы города и возвращала ПЕРВЫЙ по `sort_order`. Следствие для человека: запись
 * жёстко привязывалась к филиалу, которого он не выбирал, а второй филиал того же города был
 * недостижим вовсе. Владелец 19.08: «можно убрать все и получить первый экран с выбором филиала».
 *
 * Город остаётся ГРУППИРОВКОЙ в этом списке, а не отдельным шагом.
 */
export async function listBookableBranchesForOrganization(
  deps: InPersonServicesCatalogDeps,
  organizationId: string,
): Promise<BookableBranchOption[] | null> {
  if (!deps.bookingEngine) return null;
  const branches = await deps.bookingEngine.catalog.listBranches(organizationId);
  return branches
    .filter(
      (branch) =>
        branch.organizationId === organizationId &&
        branch.isActive &&
        !isBuiltInOnlineLocation(branch) &&
        branch.cityCode.trim().length > 0,
    )
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'ru'))
    .map((branch) => ({
      id: branch.id,
      title: branch.title,
      cityCode: branch.cityCode.trim().toLowerCase(),
      cityTitle: titleForBookingCityCode(branch.cityCode),
      sortOrder: branch.sortOrder,
    }));
}

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
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'ru'))[0];
  return match ? { id: match.id, title: match.title, cityCode: match.cityCode } : null;
}

export async function listInPersonServicesForBranch(
  deps: InPersonServicesCatalogDeps,
  organizationId: string,
  branchId: string,
  specialistId?: string | null,
): Promise<{
  branch: { id: string; title: string; cityCode: string };
  services: InPersonServiceListItem[];
} | null> {
  if (!deps.bookingEngine) return null;
  const branch = await deps.bookingEngine.catalog.getBranch(branchId);
  if (!branch || branch.organizationId !== organizationId || !branch.isActive) return null;

  const [services, specialistAvailability, specialists] = await Promise.all([
    deps.bookingEngine.services.listServices(organizationId),
    deps.bookingEngine.services.listSpecialistServiceAvailability(organizationId),
    deps.bookingEngine.catalog.listSpecialists(organizationId),
  ]);

  const activeSpecialistIds = new Set(
    specialists
      .filter(
        (specialist) =>
          specialist.organizationId === organizationId &&
          specialist.isActive &&
          (!specialistId || specialist.id === specialistId),
      )
      .map((specialist) => specialist.id),
  );
  const assignedServiceIds = new Set(
    specialistAvailability
      .filter(
        (availability) =>
          availability.organizationId === organizationId &&
          availability.isActive &&
          availability.branchId === branchId &&
          activeSpecialistIds.has(availability.specialistId),
      )
      .map((availability) => availability.serviceId),
  );

  const items = services
    .filter(
      (s) =>
        s.organizationId === organizationId &&
        s.isActive &&
        s.publicWidgetVisible &&
        !s.adminManualOnly &&
        assignedServiceIds.has(s.id),
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
