import { sql } from 'drizzle-orm';
import { runWithWebappDbOperationFamily } from '@/infra/db/saasIsolationOperationContext';
import { getWebappSqlDb, runWebappSql } from '@/infra/db/runWebappSql';
import type {
  PatientMaintenanceAppointment,
  PatientMaintenanceHistoryPort,
} from '@/modules/patient-booking/maintenanceHistory';
import { toIsoStringSafe } from '@/shared/lib/toIsoStringSafe';

type PatientMaintenanceHistoryRow = {
  appointment_id: string;
  start_at: Date | string;
  end_at: Date | string;
  status: string;
  subtitle: string;
  specialist_name: string | null;
  branch_title: string | null;
  room_title: string | null;
  service_title: string | null;
};

function mapRow(row: PatientMaintenanceHistoryRow): PatientMaintenanceAppointment {
  return {
    id: row.appointment_id,
    startAt: toIsoStringSafe(row.start_at),
    endAt: toIsoStringSafe(row.end_at),
    status: row.status,
    subtitle: row.subtitle,
    specialistName: row.specialist_name,
    branchTitle: row.branch_title,
    roomTitle: row.room_title,
    serviceTitle: row.service_title,
  };
}

export function createPgPatientMaintenanceHistoryPort(): PatientMaintenanceHistoryPort {
  return {
    async listCurrentPatientHistory() {
      const result = await runWithWebappDbOperationFamily('patient_booking_history', () =>
        runWebappSql<PatientMaintenanceHistoryRow>(
          getWebappSqlDb(),
          sql`SELECT * FROM app.read_current_patient_appointment_history()`,
        ),
      );
      return result.rows.map(mapRow);
    },
  };
}
