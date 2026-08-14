import type { PatientBookingCatalogPort } from '@/modules/patient-booking/patientBookingCatalog';

export const inMemoryPatientBookingCatalogPort: PatientBookingCatalogPort = {
  async listCurrentPatientCatalog() {
    return [];
  },
};
