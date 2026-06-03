import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  countServicesWithoutAvailability,
  hasScheduleOnUpcomingDays,
  pickDefaultSpecialist,
} from "@/app/app/settings/bookingSoloAdminApi";
import { parseBookingSlotsReadSource } from "@/modules/patient-booking/slotsReadSource";

function parseDoctorAppointmentsReadSource(valueJson: unknown): "rubitime_legacy" | "canonical" {
  if (
    valueJson !== null &&
    typeof valueJson === "object" &&
    "value" in (valueJson as Record<string, unknown>) &&
    (valueJson as { value: unknown }).value === "canonical"
  ) {
    return "canonical";
  }
  if (valueJson === "canonical") return "canonical";
  return "rubitime_legacy";
}

export type BookingAdminOverviewData =
  | { unavailable: true }
  | {
      unavailable: false;
      stats: {
        bookingEnabled: boolean;
        activeLocations: number;
        activeServices: number;
        patientVisibleServices: number;
        hasCustomSchedule: boolean;
        hasUpcomingSchedule: boolean;
        servicesWithoutAvailability: number;
        bridgeEnabled: boolean;
      };
      warnings: string[];
      readSourceConflict: boolean;
    };

export async function loadBookingAdminOverview(): Promise<BookingAdminOverviewData> {
  const deps = buildAppDeps();
  const service = deps.bookingEngine;
  if (!service) return { unavailable: true };

  const organizationId = await service.organization.getDefaultOrganizationId();
  const bridgeStatePromise = service.bridge.isBridgeEnabled().then(async (enabled) => ({
    enabled,
    mapping: enabled ? await service.bridge.getMappingSummary(organizationId) : null,
  }));
  const [
    branches,
    services,
    specialists,
    specialistAvailability,
    locationAvailability,
    bridgeState,
    readSourceRow,
    slotsReadSourceRow,
    usesHoursFallback,
    workingHoursRows,
  ] = await Promise.all([
    service.catalog.listBranches(organizationId),
    service.services.listServices(organizationId),
    service.catalog.listSpecialists(organizationId),
    service.services.listSpecialistServiceAvailability(organizationId),
    service.services.listServiceLocationAvailability(organizationId),
    bridgeStatePromise,
    deps.systemSettings?.getSetting("booking_doctor_appointments_read_source", "admin"),
    deps.systemSettings?.getSetting("booking_slots_read_source", "admin"),
    deps.bookingScheduling?.usesWorkingHoursFallback({ organizationId }) ?? Promise.resolve(true),
    deps.bookingScheduling?.listWorkingHoursAdmin({ organizationId }) ?? Promise.resolve([]),
  ]);
  const bridgeEnabled = bridgeState.enabled;
  const mappingSummary = bridgeState.mapping;

  const activeBranches = branches.filter((b) => b.isActive);
  const activeServices = services.filter((s) => s.isActive);
  const publicServices = activeServices.filter((s) => s.publicWidgetVisible && !s.adminManualOnly);
  const activeLocationIds = new Set(activeBranches.map((b) => b.id));

  const doctorAppointmentsReadSource = parseDoctorAppointmentsReadSource(readSourceRow?.valueJson ?? null);
  const bookingSlotsReadSource = parseBookingSlotsReadSource(slotsReadSourceRow?.valueJson ?? null);

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
  const hasUpcomingSchedule =
    hasCustomSchedule && hasScheduleOnUpcomingDays(workingHoursRows);

  const activeAvailabilityPairs = locationAvailability.filter(
    (row) => row.isActive && activeLocationIds.has(row.branchId),
  ).length;
  const defaultSpecialist = pickDefaultSpecialist(availabilityOverview.specialists);

  const warnings: string[] = [];
  if (activeServices.length > 0 && servicesWithoutAvailability > 0) {
    warnings.push(`${servicesWithoutAvailability} услуг без доступности в локациях.`);
  }
  if (usesHoursFallback) {
    warnings.push("Расписание не настроено — используется временный режим 09:00–18:00.");
  } else if (!hasUpcomingSchedule) {
    warnings.push("На ближайшие 7 дней нет рабочих интервалов в расписании.");
  }
  if (publicServices.length === 0 && activeServices.length > 0) {
    warnings.push("Нет услуг, доступных пациентам для самостоятельной записи.");
  }
  if (activeBranches.length === 0) {
    warnings.push("Нет активных локаций.");
  }

  const readSourceConflict =
    (doctorAppointmentsReadSource === "rubitime_legacy" && bookingSlotsReadSource === "canonical") ||
    (doctorAppointmentsReadSource === "canonical" && bookingSlotsReadSource === "rubitime");

  if (readSourceConflict) {
    warnings.push("Источники записей и слотов настроены по-разному — проверьте интеграцию Rubitime.");
  }
  if (bridgeEnabled && mappingSummary) {
    if (activeBranches.length > 0 && mappingSummary.branches < activeBranches.length) {
      warnings.push("Не все активные локации сопоставлены с Rubitime.");
    }
    if (activeServices.length > 0 && mappingSummary.services < activeServices.length) {
      warnings.push("Не все активные услуги сопоставлены с Rubitime.");
    }
    if (defaultSpecialist && mappingSummary.specialists < 1) {
      warnings.push("Специалист не сопоставлен с Rubitime.");
    }
    if (activeAvailabilityPairs > 0 && mappingSummary.availabilities < activeAvailabilityPairs) {
      warnings.push("Не все связи доступности сопоставлены с Rubitime.");
    }
  }

  return {
    unavailable: false,
    stats: {
      bookingEnabled: activeBranches.length > 0 && activeServices.length > 0 && specialistAvailability.length > 0,
      activeLocations: activeBranches.length,
      activeServices: activeServices.length,
      patientVisibleServices: publicServices.length,
      hasCustomSchedule,
      hasUpcomingSchedule,
      servicesWithoutAvailability,
      bridgeEnabled,
    },
    warnings,
    readSourceConflict,
  };
}
