import { sql } from "drizzle-orm";
import { pgTable, uuid, text, jsonb, timestamp, index, foreignKey, check } from "drizzle-orm/pg-core";
import { platformUsers } from "./schema";
import {
  treatmentProgramInstances,
  treatmentProgramInstanceStageItems,
} from "./treatmentProgramInstances";

/**
 * A4 PROGRAM_PATIENT_SHAPE: журнал действий пациента по экземпляру программы.
 * O2: ЛФК — одна запись на комплекс (instance_stage_item типа lfk_complex).
 * O3: текст пост-сессии — в колонке `note` (без отдельного lfk_session.note).
 */
export const programActionLog = pgTable(
  "program_action_log",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    instanceId: uuid("instance_id").notNull(),
    instanceStageItemId: uuid("instance_stage_item_id").notNull(),
    patientUserId: uuid("patient_user_id").notNull(),
    /** Группировка отметок за один «заход» (run-screen / чек-лист). */
    sessionId: uuid("session_id"),
    actionType: text("action_type").notNull(),
    /** Структурированные данные (напр. difficulty для ЛФК, testResultId для маркера теста). */
    payload: jsonb("payload").$type<Record<string, unknown> | null>(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_program_action_log_instance").using("btree", table.instanceId.asc().nullsLast().op("uuid_ops")),
    index("idx_program_action_log_stage_item").using(
      "btree",
      table.instanceStageItemId.asc().nullsLast().op("uuid_ops"),
    ),
    index("idx_program_action_log_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
    foreignKey({
      columns: [table.instanceId],
      foreignColumns: [treatmentProgramInstances.id],
      name: "program_action_log_instance_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.instanceStageItemId],
      foreignColumns: [treatmentProgramInstanceStageItems.id],
      name: "program_action_log_instance_stage_item_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.patientUserId],
      foreignColumns: [platformUsers.id],
      name: "program_action_log_patient_user_id_fkey",
    }).onDelete("cascade"),
    check(
      "program_action_log_action_type_check",
      sql`action_type = ANY (ARRAY['done'::text, 'viewed'::text, 'note'::text])`,
    ),
  ],
);
