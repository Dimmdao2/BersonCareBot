import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import {
  patientDiaryDaySnapshots,
  type PatientDiaryDaySnapshotInsert,
  type PatientDiaryDaySnapshotRow,
} from "../../../db/schema/patientDiarySnapshots";
import type { PatientDiarySnapshotsPort } from "@/modules/patient-diary/ports";

export function createPgPatientDiarySnapshotsPort(): PatientDiarySnapshotsPort {
  return {
    async insertIfMissing(row: PatientDiaryDaySnapshotInsert): Promise<boolean> {
      const db = getDrizzle();
      const inserted = await db
        .insert(patientDiaryDaySnapshots)
        .values(row)
        .onConflictDoNothing({ target: [patientDiaryDaySnapshots.platformUserId, patientDiaryDaySnapshots.localDate] })
        .returning({ platformUserId: patientDiaryDaySnapshots.platformUserId });
      return inserted.length > 0;
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
  };
}
