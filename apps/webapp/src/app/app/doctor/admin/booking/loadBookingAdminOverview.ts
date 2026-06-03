import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
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
  const [
    branches,
    services,
    specialistAvailability,
    locationAvailability,
    bridgeEnabled,
    readSourceRow,
    slotsReadSourceRow,
    usesHoursFallback,
  ] = await Promise.all([
    service.catalog.listBranches(organizationId),
    service.services.listServices(organizationId),
    service.services.listSpecialistServiceAvailability(organizationId),
    service.services.listServiceLocationAvailability(organizationId),
    service.bridge.isBridgeEnabled(),
    deps.systemSettings?.getSetting("booking_doctor_appointments_read_source", "admin"),
    deps.systemSettings?.getSetting("booking_slots_read_source", "admin"),
    deps.bookingScheduling?.usesWorkingHoursFallback({ organizationId }) ?? Promise.resolve(true),
  ]);

  const activeBranches = branches.filter((b) => b.isActive);
  const activeServices = services.filter((s) => s.isActive);
  const publicServices = activeServices.filter((s) => s.publicWidgetVisible && !s.adminManualOnly);

  const doctorAppointmentsReadSource = parseDoctorAppointmentsReadSource(readSourceRow?.valueJson ?? null);
  const bookingSlotsReadSource = parseBookingSlotsReadSource(slotsReadSourceRow?.valueJson ?? null);

  const activeLocationIds = new Set(activeBranches.map((b) => b.id));
  const servicesWithAvailability = new Set<string>();
  for (const row of locationAvailability) {
    if (!row.isActive || !activeLocationIds.has(row.branchId)) continue;
    servicesWithAvailability.add(row.serviceId);
  }
  const servicesWithoutAvailability = activeServices.filter((s) => !servicesWithAvailability.has(s.id)).length;

  const warnings: string[] = [];
  if (activeServices.length > 0 && servicesWithoutAvailability > 0) {
    warnings.push(`${servicesWithoutAvailability} услуг без доступности в локациях.`);
  }
  if (usesHoursFallback) {
    warnings.push("Расписание не настроено — используется временный режим 09:00–18:00.");
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

  return {
    unavailable: false,
    stats: {
      bookingEnabled: activeBranches.length > 0 && activeServices.length > 0 && specialistAvailability.length > 0,
      activeLocations: activeBranches.length,
      activeServices: activeServices.length,
      patientVisibleServices: publicServices.length,
      hasCustomSchedule: !usesHoursFallback,
      servicesWithoutAvailability,
      bridgeEnabled,
    },
    warnings,
    readSourceConflict,
  };
}
