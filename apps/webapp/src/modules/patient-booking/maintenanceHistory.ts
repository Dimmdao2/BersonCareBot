export type PatientMaintenanceAppointment = {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  subtitle: string;
  specialistName: string | null;
  branchTitle: string | null;
  roomTitle: string | null;
  serviceTitle: string | null;
};

export type PatientMaintenanceHistoryPort = {
  listCurrentPatientHistory(): Promise<PatientMaintenanceAppointment[]>;
};

export function createPatientMaintenanceHistoryService(port: PatientMaintenanceHistoryPort) {
  return {
    listCurrentPatientHistory(): Promise<PatientMaintenanceAppointment[]> {
      return port.listCurrentPatientHistory();
    },
  };
}

export type PatientMaintenanceHistoryService = ReturnType<typeof createPatientMaintenanceHistoryService>;
