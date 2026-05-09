import { boolean, date, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Ленивый снимок дня дневника пациента (разминки + план): immutable после записи.
 * Ключ: календарный день пациента (`local_date` + `platform_user_id`).
 */
export const patientDiaryDaySnapshots = pgTable(
  "patient_diary_day_snapshots",
  {
    platformUserId: uuid("platform_user_id").notNull(),
    localDate: date("local_date", { mode: "string" }).notNull(),
    iana: text("iana").notNull(),
    warmupSlotLimit: integer("warmup_slot_limit").notNull(),
    warmupDoneCount: integer("warmup_done_count").notNull(),
    warmupAllDone: boolean("warmup_all_done").notNull(),
    planInstanceId: uuid("plan_instance_id"),
    planItemIds: jsonb("plan_item_ids").$type<string[]>().notNull(),
    planDoneMask: jsonb("plan_done_mask").$type<boolean[]>().notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.platformUserId, t.localDate] })],
);

export type PatientDiaryDaySnapshotRow = typeof patientDiaryDaySnapshots.$inferSelect;
export type PatientDiaryDaySnapshotInsert = typeof patientDiaryDaySnapshots.$inferInsert;
