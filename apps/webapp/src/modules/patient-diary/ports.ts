import type { PatientDiaryDaySnapshotInsert, PatientDiaryDaySnapshotRow } from "../../../db/schema/patientDiarySnapshots";

export type PatientDiarySnapshotsPort = {
  /**
   * Вставить снимок, если строки ещё нет. Immutable: при конфликте по PK — no-op.
   * @returns true если вставлена новая строка
   */
  insertIfMissing(row: PatientDiaryDaySnapshotInsert): Promise<boolean>;
  listForUserDateRange(
    platformUserId: string,
    fromLocalDate: string,
    toLocalDateInclusive: string,
  ): Promise<PatientDiaryDaySnapshotRow[]>;
};

export type { PatientDiaryDaySnapshotRow };
