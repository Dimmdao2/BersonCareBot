import { and, asc, eq, gte, lte, min, sql } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import {
  patientDiaryDaySnapshots,
  type PatientDiaryDaySnapshotInsert,
  type PatientDiaryDaySnapshotRow,
} from '../../../db/schema/patientDiarySnapshots';
import type { PatientDiarySnapshotsPort } from '@/modules/patient-diary/ports';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';

export function createPgPatientDiarySnapshotsPort(): PatientDiarySnapshotsPort {
  return {
    async insertIfMissing(row: PatientDiaryDaySnapshotInsert): Promise<boolean> {
      const result = await runWebappNamedRoot<{ inserted: boolean }>(
        getWebappSqlDb(),
        'app.capture_current_patient_diary_day_snapshot(text,text,integer,integer,boolean,uuid,text,text)',
        [
          row.localDate,
          row.iana,
          row.warmupSlotLimit,
          row.warmupDoneCount,
          row.warmupAllDone,
          row.planInstanceId ?? null,
          JSON.stringify(row.planItemIds),
          JSON.stringify(row.planDoneMask),
        ],
        sql`SELECT app.capture_current_patient_diary_day_snapshot(
          ${row.localDate}::text,
          ${row.iana}::text,
          ${row.warmupSlotLimit}::integer,
          ${row.warmupDoneCount}::integer,
          ${row.warmupAllDone}::boolean,
          ${row.planInstanceId ?? null}::uuid,
          ${JSON.stringify(row.planItemIds)}::text,
          ${JSON.stringify(row.planDoneMask)}::text
        ) AS inserted`,
      );
      void row.organizationId;
      void row.platformUserId;
      return result.rows[0]?.inserted === true;
    },

    async listForUserDateRange(
      platformUserId: string,
      fromLocalDate: string,
      toLocalDateInclusive: string,
    ): Promise<PatientDiaryDaySnapshotRow[]> {
      const db = getDrizzle();
      return db
        .select()
        .from(patientDiaryDaySnapshots)
        .where(
          and(
            eq(patientDiaryDaySnapshots.platformUserId, platformUserId),
            gte(patientDiaryDaySnapshots.localDate, fromLocalDate),
            lte(patientDiaryDaySnapshots.localDate, toLocalDateInclusive),
          ),
        )
        .orderBy(asc(patientDiaryDaySnapshots.localDate));
    },

    async minLocalDateForUser(platformUserId: string): Promise<string | null> {
      const db = getDrizzle();
      const row = await db
        .select({ d: min(patientDiaryDaySnapshots.localDate) })
        .from(patientDiaryDaySnapshots)
        .where(eq(patientDiaryDaySnapshots.platformUserId, platformUserId));
      return row[0]?.d ?? null;
    },
  };
}
