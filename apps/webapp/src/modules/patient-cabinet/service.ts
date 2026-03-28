import type { AppointmentSummary, PastAppointmentSummary } from "@/modules/appointments/service";

export type PatientCabinetState = {
  enabled: boolean;
  reason: string;
  nextAppointmentLabel: string | null;
};

export type GetUpcomingAppointmentsPort = (userId: string) => Promise<AppointmentSummary[]>;
export type GetPastAppointmentsPort = (userId: string) => Promise<PastAppointmentSummary[]>;

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
  getPastAppointments: GetPastAppointmentsPort;
}): {
  getPatientCabinetState: (userId: string) => Promise<PatientCabinetState>;
  getUpcomingAppointments: (userId: string) => Promise<AppointmentSummary[]>;
  getPastAppointments: (userId: string) => Promise<PastAppointmentSummary[]>;
} {
  return {
    async getPatientCabinetState(userId: string) {
      const list = await deps.getUpcomingAppointments(userId);
      return computeCabinetState(list.length);
    },
    getUpcomingAppointments: deps.getUpcomingAppointments,
    getPastAppointments: deps.getPastAppointments,
  };
}

/** Pure helper for tests. */
export function getPatientCabinetState(appointmentCount: number): PatientCabinetState {
  return computeCabinetState(appointmentCount);
}
