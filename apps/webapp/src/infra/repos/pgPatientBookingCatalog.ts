import { runWithWebappDbOperationFamily } from '@/infra/db/saasIsolationOperationContext';
import { runWebappPgText } from '@/infra/db/runWebappSql';
import type {
  PatientBookingCatalogPort,
  PatientBookingCatalogRow,
} from '@/modules/patient-booking/patientBookingCatalog';

type PatientBookingCatalogDbRow = {
  branch_id: string;
  branch_title: string;
  city_code: string;
  branch_sort_order: number;
  service_id: string;
  service_title: string;
  service_description: string | null;
  duration_minutes: number;
  price_minor: number;
  service_sort_order: number;
};

function mapRow(row: PatientBookingCatalogDbRow): PatientBookingCatalogRow {
  return {
    branchId: row.branch_id,
    branchTitle: row.branch_title,
    cityCode: row.city_code,
    branchSortOrder: row.branch_sort_order,
    serviceId: row.service_id,
    serviceTitle: row.service_title,
    serviceDescription: row.service_description,
    durationMinutes: row.duration_minutes,
    priceMinor: row.price_minor,
    serviceSortOrder: row.service_sort_order,
  };
}

export function createPgPatientBookingCatalogPort(): PatientBookingCatalogPort {
  return {
    async listCurrentPatientCatalog() {
      const result = await runWithWebappDbOperationFamily('patient_booking_catalog', () =>
        runWebappPgText<PatientBookingCatalogDbRow>(
          'SELECT * FROM app.read_current_patient_booking_catalog()',
        ),
      );
      return result.rows.map(mapRow);
    },
  };
}
