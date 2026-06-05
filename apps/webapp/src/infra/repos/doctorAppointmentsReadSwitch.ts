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
    listAppointmentsForSpecialist: async (filter) => (await pick()).listAppointmentsForSpecialist(filter),
    getAppointmentStats: async (filter, audience) => (await pick()).getAppointmentStats(filter, audience),
    getDashboardAppointmentMetrics: async (audience) =>
      (await pick()).getDashboardAppointmentMetrics(audience),
  };
}
