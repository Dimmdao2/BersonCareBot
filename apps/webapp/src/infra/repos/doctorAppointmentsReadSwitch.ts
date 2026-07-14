import type { DoctorAppointmentsPort } from "@/modules/doctor-appointments/ports";

/** Retired source setting value kept only for parsing old rows/docs during Rubitime retirement. */
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
  return "canonical";
}

/**
 * Rubitime R2 cutover: doctor-facing appointment reads are canonical-only.
 * `booking_doctor_appointments_read_source` no longer changes runtime behavior, and
 * missing canonical wiring fails closed instead of falling back to legacy rows.
 */
export function createDoctorAppointmentsReadSwitchPort(input: {
  canonicalPort: DoctorAppointmentsPort | null;
  resolveReadSource: () => Promise<DoctorAppointmentsReadSource>;
}): DoctorAppointmentsPort {
  const pick = async (): Promise<DoctorAppointmentsPort> => {
    void input.resolveReadSource;
    const port = input.canonicalPort;
    if (!port) throw new Error("doctor_appointments_canonical_port_unavailable");
    return port;
  };

  return {
    listAppointmentsForSpecialist: async (filter, audience) =>
      (await pick()).listAppointmentsForSpecialist(filter, audience),
    getAppointmentStats: async (filter, audience) => (await pick()).getAppointmentStats(filter, audience),
    getDashboardAppointmentMetrics: async (audience) =>
      (await pick()).getDashboardAppointmentMetrics(audience),
    getScheduleKpis: async (query, audience) =>
      (await pick()).getScheduleKpis(query, audience),
    getAppointmentDailySeries: async (filter, audience) =>
      (await pick()).getAppointmentDailySeries(filter, audience),
  };
}
