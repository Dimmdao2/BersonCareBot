import type { PatientMaintenanceHistoryPort } from "@/modules/patient-booking/maintenanceHistory";

export const inMemoryPatientMaintenanceHistoryPort: PatientMaintenanceHistoryPort = {
  async listCurrentPatientHistory() {
    return [];
  },
};
