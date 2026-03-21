import type { AppointmentSummary } from "@/modules/appointments/service";

export type PatientCabinetState = {
  enabled: boolean;
  reason: string;
  nextAppointmentLabel: string | null;
};

export type GetUpcomingAppointmentsPort = (userId: string) => Promise<AppointmentSummary[]>;

function computeCabinetState(appointmentCount: number): PatientCabinetState {
  const hasAppointments = appointmentCount > 0;
  return {
    enabled: hasAppointments,
    reason: hasAppointments
      ? "Здесь отображаются ваши записи и программы."
      : "У вас пока нет записей на приём.",
    nextAppointmentLabel: hasAppointments ? "Ближайшая запись в разделе ниже" : null,
  };
}

/**
 * Creates patient cabinet service that uses the given port to fetch appointments.
 * Encapsulates enabled/nextAppointmentLabel logic inside the service.
 */
export function createPatientCabinetService(deps: {
  getUpcomingAppointments: GetUpcomingAppointmentsPort;
}): {
  getPatientCabinetState: (userId: string) => Promise<PatientCabinetState>;
  getUpcomingAppointments: (userId: string) => Promise<AppointmentSummary[]>;
} {
  return {
    async getPatientCabinetState(userId: string) {
      const list = await deps.getUpcomingAppointments(userId);
      return computeCabinetState(list.length);
    },
    getUpcomingAppointments: deps.getUpcomingAppointments,
  };
}

/** Pure helper for tests. */
export function getPatientCabinetState(appointmentCount: number): PatientCabinetState {
  return computeCabinetState(appointmentCount);
}
