import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  countServicesWithoutAvailability,
  hasScheduleOnUpcomingDays,
} from '@/app/app/settings/bookingSoloAdminApi';

export type BookingAdminOverviewData =
  | { unavailable: true }
  | {
      unavailable: false;
      organizationRequired: true;
    }
  | {
      unavailable: false;
      organizationRequired: false;
      stats: {
        bookingEnabled: boolean;
        activeLocations: number;
        activeServices: number;
        patientVisibleServices: number;
        hasCustomSchedule: boolean;
        hasUpcomingSchedule: boolean;
        servicesWithoutAvailability: number;
      };
      warnings: string[];
    };

export async function loadBookingAdminOverview(
  organizationId: string | null,
): Promise<BookingAdminOverviewData> {
  if (!organizationId) {
    return { unavailable: false, organizationRequired: true };
  }

  const deps = buildAppDeps();
  const service = deps.bookingEngine;
  if (!service) return { unavailable: true };

  const [
    branches,
    services,
    specialists,
    specialistAvailability,
    locationAvailability,
    usesHoursFallback,
    workingHoursRows,
  ] = await Promise.all([
    service.catalog.listBranches(organizationId),
    service.services.listServices(organizationId),
    service.catalog.listSpecialists(organizationId),
    service.services.listSpecialistServiceAvailability(organizationId),
    service.services.listServiceLocationAvailability(organizationId),
    deps.bookingScheduling?.usesWorkingHoursFallback({ organizationId }) ?? Promise.resolve(true),
    deps.bookingScheduling?.listWorkingHoursAdmin({ organizationId }) ?? Promise.resolve([]),
  ]);

  const activeBranches = branches.filter((b) => b.isActive);
  const activeServices = services.filter((s) => s.isActive);
  const publicServices = activeServices.filter((s) => s.publicWidgetVisible && !s.adminManualOnly);
  const activeLocationIds = new Set(activeBranches.map((b) => b.id));

  const availabilityOverview = {
    locationAvailability,
    specialistAvailability,
    specialists: specialists.map((s) => ({ id: s.id, fullName: s.fullName, isActive: s.isActive })),
  };
  const servicesWithoutAvailability = countServicesWithoutAvailability(
    activeServices,
    activeLocationIds,
    availabilityOverview,
  );

  const hasCustomSchedule = !usesHoursFallback;
  const hasUpcomingSchedule = hasCustomSchedule && hasScheduleOnUpcomingDays(workingHoursRows);

  const warnings: string[] = [];
  if (activeServices.length > 0 && servicesWithoutAvailability > 0) {
    warnings.push(`${servicesWithoutAvailability} услуг без доступности в локациях.`);
  }
  if (usesHoursFallback) {
    warnings.push('Расписание не настроено — используется временный режим 09:00–18:00.');
  } else if (!hasUpcomingSchedule) {
    warnings.push('На ближайшие 7 дней нет рабочих интервалов в расписании.');
  }
  if (publicServices.length === 0 && activeServices.length > 0) {
    warnings.push('Нет услуг, доступных пациентам для самостоятельной записи.');
  }
  if (activeBranches.length === 0) {
    warnings.push('Нет активных локаций.');
  }

  return {
    unavailable: false,
    organizationRequired: false,
    stats: {
      bookingEnabled:
        activeBranches.length > 0 && activeServices.length > 0 && specialistAvailability.length > 0,
      activeLocations: activeBranches.length,
      activeServices: activeServices.length,
      patientVisibleServices: publicServices.length,
      hasCustomSchedule,
      hasUpcomingSchedule,
      servicesWithoutAvailability,
    },
    warnings,
  };
}
