import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  index,
  foreignKey,
  check,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { platformUsers } from "./schema";
import { clinicalTests } from "./clinicalTests";
import { treatmentProgramInstanceStageItems } from "./treatmentProgramInstances";

/** Попытка прохождения набора тестов в элементе экземпляра программы (таблица БД `test_attempts`). */
export const treatmentProgramTestAttempts = pgTable(
  "test_attempts",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    instanceStageItemId: uuid("instance_stage_item_id").notNull(),
    patientUserId: uuid("patient_user_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    /** Пациент отправил полный набор тестов в рамках попытки. */
    submittedAt: timestamp("submitted_at", { withTimezone: true, mode: "string" }),
    /** Врач принял попытку для зачёта пункта в чеклисте (MVP-B). */
    acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: "string" }),
    acceptedBy: uuid("accepted_by"),
  },
  (table) => [
    index("idx_test_attempts_stage_item").using(
      "btree",
      table.instanceStageItemId.asc().nullsLast().op("uuid_ops"),
    ),
    index("idx_test_attempts_patient").using("btree", table.patientUserId.asc().nullsLast().op("uuid_ops")),
    foreignKey({
      columns: [table.instanceStageItemId],
      foreignColumns: [treatmentProgramInstanceStageItems.id],
      name: "test_attempts_instance_stage_item_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.patientUserId],
      foreignColumns: [platformUsers.id],
      name: "test_attempts_patient_user_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.acceptedBy],
      foreignColumns: [platformUsers.id],
      name: "test_attempts_accepted_by_fkey",
    }).onDelete("set null"),
    uniqueIndex("idx_test_attempts_one_open_per_item_patient")
      .on(table.instanceStageItemId, table.patientUserId)
      .where(sql`submitted_at IS NULL`),
  ],
);

/** Результат одного клинического теста в рамках попытки (таблица БД `test_results`). */
export const treatmentProgramTestResults = pgTable(
  "test_results",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    attemptId: uuid("attempt_id").notNull(),
    testId: uuid("test_id").notNull(),
    rawValue: jsonb("raw_value").$type<Record<string, unknown>>().notNull(),
    normalizedDecision: text("normalized_decision").notNull(),
    decidedBy: uuid("decided_by"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_test_results_attempt").using("btree", table.attemptId.asc().nullsLast().op("uuid_ops")),
    index("idx_test_results_test").using("btree", table.testId.asc().nullsLast().op("uuid_ops")),
    foreignKey({
      columns: [table.attemptId],
      foreignColumns: [treatmentProgramTestAttempts.id],
      name: "test_results_attempt_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.testId],
      foreignColumns: [clinicalTests.id],
      name: "test_results_test_id_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.decidedBy],
      foreignColumns: [platformUsers.id],
      name: "test_results_decided_by_fkey",
    }).onDelete("set null"),
    check(
      "test_results_normalized_decision_check",
      sql`normalized_decision = ANY (ARRAY['passed'::text, 'failed'::text, 'partial'::text])`,
    ),
    uniqueIndex("idx_test_results_attempt_test").on(table.attemptId, table.testId),
  ],
);
