import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  index,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { platformUsers, appointmentRecords } from "./schema";

/**
 * Клинический «ядро» карты пациента (раздел «Карта» кабинета врача).
 * Источник правды для визитов / жалоб / диагнозов; файлы линкуются через
 * существующую таблицу patient_files (см. visit_id там).
 *
 * Жалобы и диагнозы — «состояние пациента» (живёт во времени), их severity /
 * уточнения пишутся через *_update строки, каждая привязана к визиту.
 * Справочник диагнозов (clinical_diagnosis_catalog) — собственный, общеклиничный
 * (НЕ МКБ, НЕ свободный текст): autocomplete + создание новых записей.
 */

export const CLINICAL_VISIT_TYPES = ["first", "repeat"] as const;
export type ClinicalVisitType = (typeof CLINICAL_VISIT_TYPES)[number];

export const CLINICAL_COMPLAINT_STATUSES = ["active", "resolved"] as const;
export type ClinicalComplaintStatus = (typeof CLINICAL_COMPLAINT_STATUSES)[number];

export const CLINICAL_DIAGNOSIS_STATUSES = ["active", "refined", "resolved"] as const;
export type ClinicalDiagnosisStatus = (typeof CLINICAL_DIAGNOSIS_STATUSES)[number];

// -- Справочник диагнозов (общеклиничный, без привязки к пациенту) ------------

export const clinicalDiagnosisCatalog = pgTable(
  "clinical_diagnosis_catalog",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    label: text("label").notNull(),
    note: text("note"),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_clinical_diagnosis_catalog_label").on(table.label),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [platformUsers.id],
      name: "clinical_diagnosis_catalog_created_by_fkey",
    }).onDelete("restrict"),
  ],
);

// -- Визит --------------------------------------------------------------------

export const clinicalVisit = pgTable(
  "clinical_visit",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    patientUserId: uuid("patient_user_id").notNull(),
    visitType: text("visit_type").notNull(),
    visitedAt: timestamp("visited_at", { withTimezone: true, mode: "string" }).notNull(),
    location: text("location"),
    service: text("service"),
    duration: text("duration"),
    /** Необязательная связь с записью на приём (бронированием). */
    appointmentRecordId: uuid("appointment_record_id"),
    exam: text("exam"),
    manipulations: text("manipulations"),
    trialResults: text("trial_results"),
    recommendations: text("recommendations"),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_clinical_visit_patient_user_id").on(table.patientUserId),
    index("idx_clinical_visit_visited_at").on(table.visitedAt),
    foreignKey({
      columns: [table.patientUserId],
      foreignColumns: [platformUsers.id],
      name: "clinical_visit_patient_user_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.appointmentRecordId],
      foreignColumns: [appointmentRecords.id],
      name: "clinical_visit_appointment_record_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [platformUsers.id],
      name: "clinical_visit_created_by_fkey",
    }).onDelete("restrict"),
    check(
      "clinical_visit_visit_type_check",
      sql`visit_type = ANY (ARRAY['first'::text, 'repeat'::text])`,
    ),
  ],
);

// -- Жалоба (состояние) + её обновления (severity per visit) ------------------

export const clinicalComplaint = pgTable(
  "clinical_complaint",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    patientUserId: uuid("patient_user_id").notNull(),
    text: text("text").notNull(),
    priority: boolean("priority").default(false).notNull(),
    status: text("status").default("active").notNull(),
    sourceVisitId: uuid("source_visit_id").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_clinical_complaint_patient_user_id").on(table.patientUserId),
    foreignKey({
      columns: [table.patientUserId],
      foreignColumns: [platformUsers.id],
      name: "clinical_complaint_patient_user_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.sourceVisitId],
      foreignColumns: [clinicalVisit.id],
      name: "clinical_complaint_source_visit_id_fkey",
    }).onDelete("cascade"),
    check(
      "clinical_complaint_status_check",
      sql`status = ANY (ARRAY['active'::text, 'resolved'::text])`,
    ),
  ],
);

export const clinicalComplaintUpdate = pgTable(
  "clinical_complaint_update",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    complaintId: uuid("complaint_id").notNull(),
    visitId: uuid("visit_id").notNull(),
    note: text("note"),
    severity: integer("severity").notNull(),
    resolved: boolean("resolved").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_clinical_complaint_update_complaint_id").on(table.complaintId),
    index("idx_clinical_complaint_update_visit_id").on(table.visitId),
    foreignKey({
      columns: [table.complaintId],
      foreignColumns: [clinicalComplaint.id],
      name: "clinical_complaint_update_complaint_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.visitId],
      foreignColumns: [clinicalVisit.id],
      name: "clinical_complaint_update_visit_id_fkey",
    }).onDelete("cascade"),
    check(
      "clinical_complaint_update_severity_check",
      sql`severity >= 0 AND severity <= 10`,
    ),
  ],
);

// -- Диагноз (состояние) + его обновления (уточнения / снятие) ----------------

export const clinicalDiagnosis = pgTable(
  "clinical_diagnosis",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    patientUserId: uuid("patient_user_id").notNull(),
    /** Nullable для устойчивости: запись может пережить удаление из справочника. */
    catalogId: uuid("catalog_id"),
    text: text("text").notNull(),
    priority: boolean("priority").default(false).notNull(),
    status: text("status").default("active").notNull(),
    sourceVisitId: uuid("source_visit_id").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_clinical_diagnosis_patient_user_id").on(table.patientUserId),
    foreignKey({
      columns: [table.patientUserId],
      foreignColumns: [platformUsers.id],
      name: "clinical_diagnosis_patient_user_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.catalogId],
      foreignColumns: [clinicalDiagnosisCatalog.id],
      name: "clinical_diagnosis_catalog_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.sourceVisitId],
      foreignColumns: [clinicalVisit.id],
      name: "clinical_diagnosis_source_visit_id_fkey",
    }).onDelete("cascade"),
    check(
      "clinical_diagnosis_status_check",
      sql`status = ANY (ARRAY['active'::text, 'refined'::text, 'resolved'::text])`,
    ),
  ],
);

export const clinicalDiagnosisUpdate = pgTable(
  "clinical_diagnosis_update",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    diagnosisId: uuid("diagnosis_id").notNull(),
    visitId: uuid("visit_id").notNull(),
    refinement: text("refinement"),
    status: text("status").notNull(),
    removed: boolean("removed").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_clinical_diagnosis_update_diagnosis_id").on(table.diagnosisId),
    index("idx_clinical_diagnosis_update_visit_id").on(table.visitId),
    foreignKey({
      columns: [table.diagnosisId],
      foreignColumns: [clinicalDiagnosis.id],
      name: "clinical_diagnosis_update_diagnosis_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.visitId],
      foreignColumns: [clinicalVisit.id],
      name: "clinical_diagnosis_update_visit_id_fkey",
    }).onDelete("cascade"),
  ],
);
