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
      readiness: {
        total: number;
        done: number;
        items: Array<{ id: string; label: string; ok: boolean }>;
      };
      mode: {
        doctorAppointmentsReadSource: "rubitime_legacy" | "canonical";
        bookingSlotsReadSource: "rubitime" | "canonical";
        calendarReadSource: "rubitime_legacy" | "canonical";
        bridgeEnabled: boolean;
      };
      warnings: string[];
      mapping: {
        branches: number;
        specialists: number;
        services: number;
        availabilities: number;
        appointments: number;
      };
    };

export async function loadBookingAdminOverview(): Promise<BookingAdminOverviewData> {
  const deps = buildAppDeps();
  const service = deps.bookingEngine;
  if (!service) return { unavailable: true };

  const organizationId = await service.organization.getDefaultOrganizationId();
  const [
    organization,
    branches,
    specialists,
    services,
    specialistAvailability,
    mapping,
    bridgeEnabled,
    readSourceRow,
    slotsReadSourceRow,
    formFields,
    paymentEnabledRow,
    usesHoursFallback,
  ] = await Promise.all([
    service.organization.getOrganization(organizationId),
    service.catalog.listBranches(organizationId),
    service.catalog.listSpecialists(organizationId),
    service.services.listServices(organizationId),
    service.services.listSpecialistServiceAvailability(organizationId),
    service.bridge.getMappingSummary(organizationId),
    service.bridge.isBridgeEnabled(),
    deps.systemSettings?.getSetting("booking_doctor_appointments_read_source", "admin"),
    deps.systemSettings?.getSetting("booking_slots_read_source", "admin"),
    deps.bookingForm?.listAdminFields(organizationId) ?? Promise.resolve([]),
    deps.systemSettings?.getSetting("booking_payment_enabled", "admin"),
    deps.bookingScheduling?.usesWorkingHoursFallback({ organizationId }) ?? Promise.resolve(true),
  ]);

  const activeBranches = branches.filter((b) => b.isActive);
  const activeSpecialists = specialists.filter((s) => s.isActive);
  const activeServices = services.filter((s) => s.isActive);
  const publicServices = activeServices.filter((s) => s.publicWidgetVisible && !s.adminManualOnly);

  const doctorAppointmentsReadSource = parseDoctorAppointmentsReadSource(readSourceRow?.valueJson ?? null);
  const bookingSlotsReadSource = parseBookingSlotsReadSource(slotsReadSourceRow?.valueJson ?? null);

  const paymentEnabled =
    paymentEnabledRow != null &&
    paymentEnabledRow.valueJson !== null &&
    typeof paymentEnabledRow.valueJson === "object" &&
    (paymentEnabledRow.valueJson as Record<string, unknown>).value === true;

  const readinessItems = [
    { id: "org", label: "Организация", ok: Boolean(organization?.title?.trim()) },
    { id: "branches", label: "Активные филиалы", ok: activeBranches.length > 0 },
    { id: "specialists", label: "Специалисты", ok: activeSpecialists.length > 0 },
    { id: "services", label: "Услуги", ok: activeServices.length > 0 },
    { id: "public", label: "Публичные услуги", ok: publicServices.length > 0 },
    { id: "availability", label: "Доступность", ok: specialistAvailability.length > 0 },
    { id: "hours", label: "Рабочие часы", ok: !usesHoursFallback },
    { id: "form", label: "Поля формы", ok: formFields.length > 0 },
    { id: "payment", label: "Оплата включена", ok: paymentEnabled },
    {
      id: "publicLink",
      label: "Публичная ссылка",
      ok:
        publicServices.length > 0 &&
        activeBranches.length > 0 &&
        specialistAvailability.length > 0 &&
        !usesHoursFallback,
    },
  ];

  const warnings: string[] = [];
  if (activeServices.length > 0 && specialistAvailability.length === 0) {
    warnings.push("У услуг нет привязки доступности (специалист × услуга).");
  }
  if (usesHoursFallback) {
    warnings.push("Рабочие часы: используется fallback 09:00–18:00.");
  }
  if (
    (doctorAppointmentsReadSource === "rubitime_legacy" && bookingSlotsReadSource === "canonical") ||
    (doctorAppointmentsReadSource === "canonical" && bookingSlotsReadSource === "rubitime")
  ) {
    warnings.push("Источники списка записей и слотов пациента расходятся.");
  }
  if (publicServices.length === 0 && activeServices.length > 0) {
    warnings.push("Нет услуг, доступных для публичной записи.");
  }

  return {
    unavailable: false,
    readiness: {
      total: readinessItems.length,
      done: readinessItems.filter((i) => i.ok).length,
      items: readinessItems,
    },
    mode: {
      doctorAppointmentsReadSource,
      bookingSlotsReadSource,
      calendarReadSource: doctorAppointmentsReadSource,
      bridgeEnabled,
    },
    warnings,
    mapping,
  };
}
