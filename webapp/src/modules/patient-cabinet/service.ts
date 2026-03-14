export type PatientCabinetState = {
  enabled: boolean;
  reason: string;
  nextAppointmentLabel: string | null;
};

/** MVP: cabinet enabled when there are upcoming appointments (from appointments service). */
export function getPatientCabinetState(appointmentCount: number): PatientCabinetState {
  const hasAppointments = appointmentCount > 0;
  return {
    enabled: hasAppointments,
    reason: hasAppointments
      ? "Здесь отображаются ваши записи и программы."
      : "Кабинет активируется, когда у пользователя есть запись на прием, купленный курс или назначенная программа.",
    nextAppointmentLabel: hasAppointments ? "Ближайшая запись в разделе ниже" : null,
  };
}
