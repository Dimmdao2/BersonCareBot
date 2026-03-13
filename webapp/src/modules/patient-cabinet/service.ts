export type PatientCabinetState = {
  enabled: boolean;
  reason: string;
  nextAppointmentLabel: string | null;
};

export function getPatientCabinetState(): PatientCabinetState {
  return {
    enabled: false,
    reason:
      "Кабинет активируется, когда у пользователя есть запись на прием, купленный курс или назначенная программа.",
    nextAppointmentLabel: null,
  };
}
