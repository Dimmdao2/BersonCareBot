import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  index,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { mediaFiles, platformUsers } from "./schema";
import { clinicalVisit } from "./patientClinical";

/**
 * Файлы пациента — единый источник (standalone + из визита).
 * category: выписка | снимок | анализ | фото_теста | прочее
 * visit_id: nullable FK → clinical_visit (привязка файла к визиту)
 */
export const patientFiles = pgTable(
  "patient_files",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    patientUserId: uuid("patient_user_id").notNull(),
    category: text("category").notNull(),
    fileName: text("file_name").notNull(),
    s3Key: text("s3_key").notNull(),
    s3Bucket: text("s3_bucket").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    /** Nullable: присваивается через PATCH «Привязать к визиту» */
    visitId: uuid("visit_id"),
    /** Nullable FK → media_files.id; linked when upload is routed through patient library folder.
     *  onDelete: set null — media_files row survives patient_files deletion. */
    mediaFileId: uuid("media_file_id"),
    uploadedByUserId: uuid("uploaded_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_patient_files_patient_user_id").on(table.patientUserId),
    index("idx_patient_files_category").on(table.category),
    index("idx_patient_files_visit_id")
      .on(table.visitId)
      .where(sql`visit_id IS NOT NULL`),
    index("idx_patient_files_media_file_id")
      .on(table.mediaFileId)
      .where(sql`media_file_id IS NOT NULL`),
    foreignKey({
      columns: [table.patientUserId],
      foreignColumns: [platformUsers.id],
      name: "patient_files_patient_user_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.uploadedByUserId],
      foreignColumns: [platformUsers.id],
      name: "patient_files_uploaded_by_user_id_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.visitId],
      foreignColumns: [clinicalVisit.id],
      name: "patient_files_visit_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.mediaFileId],
      foreignColumns: [mediaFiles.id],
      name: "patient_files_media_file_id_fkey",
    }).onDelete("set null"),
    check(
      "patient_files_category_check",
      sql`category = ANY (ARRAY['выписка'::text, 'снимок'::text, 'анализ'::text, 'фото_теста'::text, 'прочее'::text])`,
    ),
  ],
);
