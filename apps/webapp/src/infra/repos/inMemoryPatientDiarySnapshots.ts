import type { PatientDiaryDaySnapshotInsert, PatientDiaryDaySnapshotRow } from "../../../db/schema/patientDiarySnapshots";
import type { PatientDiarySnapshotsPort } from "@/modules/patient-diary/ports";

const rows: PatientDiaryDaySnapshotRow[] = [];

export function resetInMemoryPatientDiarySnapshotsForTests() {
  rows.length = 0;
}

export function createInMemoryPatientDiarySnapshotsPort(): PatientDiarySnapshotsPort {
  return {
    async insertIfMissing(row: PatientDiaryDaySnapshotInsert): Promise<boolean> {
      const exists = rows.some(
        (r) => r.platformUserId === row.platformUserId && r.localDate === row.localDate,
      );
      if (exists) return false;
      rows.push({
        platformUserId: row.platformUserId,
        localDate: row.localDate,
        iana: row.iana,
        warmupSlotLimit: row.warmupSlotLimit,
        warmupDoneCount: row.warmupDoneCount,
        warmupAllDone: row.warmupAllDone,
        planInstanceId: row.planInstanceId ?? null,
        planItemIds: row.planItemIds ?? [],
        planDoneMask: row.planDoneMask ?? [],
        capturedAt: row.capturedAt ?? new Date().toISOString(),
      });
      return true;
    },

    async listForUserDateRange(platformUserId, fromLocalDate, toLocalDateInclusive) {
      return rows
        .filter(
          (r) =>
            r.platformUserId === platformUserId &&
            r.localDate >= fromLocalDate &&
            r.localDate <= toLocalDateInclusive,
        )
        .sort((a, b) => a.localDate.localeCompare(b.localDate));
    },
  };
}
