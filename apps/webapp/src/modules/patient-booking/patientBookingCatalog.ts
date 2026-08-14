export type PatientBookingCatalogRow = {
  branchId: string;
  branchTitle: string;
  cityCode: string;
  branchSortOrder: number;
  serviceId: string;
  serviceTitle: string;
  serviceDescription: string | null;
  durationMinutes: number;
  priceMinor: number;
  serviceSortOrder: number;
};

export type PatientBookingCatalogPort = {
  listCurrentPatientCatalog(): Promise<PatientBookingCatalogRow[]>;
};

export function createPatientBookingCatalogService(port: PatientBookingCatalogPort) {
  return {
    listCurrentPatientCatalog(): Promise<PatientBookingCatalogRow[]> {
      return port.listCurrentPatientCatalog();
    },
  };
}

export type PatientBookingCatalogService = ReturnType<typeof createPatientBookingCatalogService>;
