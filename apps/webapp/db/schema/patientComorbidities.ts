import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { platformUsers } from "./schema";

/**
 * Сопутствующие заболевания пациента («Карта» → «Сопутствующие заболевания»).
 *
 * Записи хранят текст заболевания и статус (active / removed). Статус «removed»
 * означает «снято» (таблица «Снятые»); полного удаления нет — только soft-delete.
 * Поле since хранит человекочитаемую строку (напр. «с 2017»), введённую врачом.
 */

export const COMORBIDITY_STATUSES = ["active", "removed"] as const;
export type ComorbidityStatus = (typeof COMORBIDITY_STATUSES)[number];

export const patientComorbidity = pgTable(
  "patient_comorbidity",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    patientUserId: uuid("patient_user_id").notNull(),
    text: text("text").notNull(),
    since: text("since"),
    status: text("status").default("active").notNull(),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    removedAt: timestamp("removed_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    index("idx_patient_comorbidity_patient_user_id").on(table.patientUserId),
    index("idx_patient_comorbidity_status").on(table.patientUserId, table.status),
    foreignKey({
      columns: [table.patientUserId],
      foreignColumns: [platformUsers.id],
      name: "patient_comorbidity_patient_user_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [platformUsers.id],
      name: "patient_comorbidity_created_by_fkey",
    }).onDelete("restrict"),
    check(
      "patient_comorbidity_status_check",
      sql`status = ANY (ARRAY['active'::text, 'removed'::text])`,
    ),
  ],
);
