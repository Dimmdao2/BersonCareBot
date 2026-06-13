import type { DoctorAppointmentsPort } from "@/modules/doctor-appointments/ports";

/** Источник списка записей врача на переходном этапе (см. `booking_doctor_appointments_read_source`). */
export type DoctorAppointmentsReadSource = "rubitime_legacy" | "canonical";

function unwrapSettingValue(valueJson: unknown): unknown {
  if (
    valueJson !== null &&
    typeof valueJson === "object" &&
    "value" in (valueJson as Record<string, unknown>)
  ) {
    return (valueJson as { value: unknown }).value;
  }
  return valueJson;
}

export function parseDoctorAppointmentsReadSource(valueJson: unknown): DoctorAppointmentsReadSource {
  const value = unwrapSettingValue(valueJson);
  if (value === "canonical") return "canonical";
  return "rubitime_legacy";
}

/**
 * Выбирает legacy Rubitime (`appointment_records`) или канон (`be_appointments`) по настройке.
 * Default: `rubitime_legacy` — канон не подменяет Rubitime-read без явного cutover.
 *
 * Исключение (S2b, по D1 «canonical = единый источник KPI»): `getScheduleKpis` всегда
 * читает из canonical-порта, когда он доступен, НЕЗАВИСИМО от `booking_doctor_appointments_read_source`.
 * Причина: у legacy-порта `getScheduleKpis` — заглушка из всех нулей (per-patient аналитики там нет),
 * настоящий расчёт 9 метрик реализован только в canonical. Узкий cutover: остальной read-path
 * (список/stats/дашборд-метрики) по-прежнему следует флагу read-source, чтобы не задеть других потребителей.
 * Если canonical-порт недоступен (например, in-memory режим) — fallback на legacy.
 */
export function createDoctorAppointmentsReadSwitchPort(input: {
  legacyPort: DoctorAppointmentsPort;
  canonicalPort: DoctorAppointmentsPort | null;
  resolveReadSource: () => Promise<DoctorAppointmentsReadSource>;
}): DoctorAppointmentsPort {
  const pick = async (): Promise<DoctorAppointmentsPort> => {
    const source = await input.resolveReadSource();
    if (source === "canonical" && input.canonicalPort) {
      return input.canonicalPort;
    }
    return input.legacyPort;
  };

  return {
    listAppointmentsForSpecialist: async (filter, audience) =>
      (await pick()).listAppointmentsForSpecialist(filter, audience),
    getAppointmentStats: async (filter, audience) => (await pick()).getAppointmentStats(filter, audience),
    getDashboardAppointmentMetrics: async (audience) =>
      (await pick()).getDashboardAppointmentMetrics(audience),
    // KPI всегда из canonical (см. doc-comment выше); legacy — лишь fallback при отсутствии canonical.
    getScheduleKpis: async (query, audience) =>
      (input.canonicalPort ?? input.legacyPort).getScheduleKpis(query, audience),
  };
}
