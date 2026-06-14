/**
 * Pg implementation of PatientFilesPort.
 * Uses Drizzle ORM; no business logic here.
 */

import { and, eq, asc } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import type {
  CreatePatientFileParams,
  PatientFileCategory,
  PatientFileRecord,
  PatientFilesPort,
} from "@/modules/patient-files/ports";
import { patientFiles } from "../../../db/schema/patientFiles";

function mapRow(row: typeof patientFiles.$inferSelect): PatientFileRecord {
  return {
    id: row.id,
    patientUserId: row.patientUserId,
    category: row.category as PatientFileCategory,
    fileName: row.fileName,
    s3Key: row.s3Key,
    s3Bucket: row.s3Bucket,
    mimeType: row.mimeType,
    sizeBytes: Number(row.sizeBytes),
    visitId: row.visitId ?? null,
    uploadedByUserId: row.uploadedByUserId,
    createdAt: row.createdAt,
  };
}

export function createPgPatientFilesPort(): PatientFilesPort {
  return {
    async listFiles(patientUserId: string, category?: PatientFileCategory): Promise<PatientFileRecord[]> {
      const db = getDrizzle();
      const conditions = [eq(patientFiles.patientUserId, patientUserId)];
      if (category) {
        conditions.push(eq(patientFiles.category, category));
      }
      const rows = await db
        .select()
        .from(patientFiles)
        .where(and(...conditions))
        .orderBy(asc(patientFiles.createdAt));
      return rows.map(mapRow);
    },

    async getFile(id: string): Promise<PatientFileRecord | null> {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(patientFiles)
        .where(eq(patientFiles.id, id))
        .limit(1);
      return rows[0] ? mapRow(rows[0]) : null;
    },

    async createFile(params: CreatePatientFileParams): Promise<PatientFileRecord> {
      const db = getDrizzle();
      const inserted = await db
        .insert(patientFiles)
        .values({
          patientUserId: params.patientUserId,
          category: params.category,
          fileName: params.fileName,
          s3Key: params.s3Key,
          s3Bucket: params.s3Bucket,
          mimeType: params.mimeType,
          sizeBytes: params.sizeBytes,
          uploadedByUserId: params.uploadedByUserId,
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error("patient_files insert failed");
      return mapRow(row);
    },

    async linkFileToVisit(id: string, visitId: string): Promise<PatientFileRecord | null> {
      const db = getDrizzle();
      const updated = await db
        .update(patientFiles)
        .set({ visitId })
        .where(eq(patientFiles.id, id))
        .returning();
      const row = updated[0];
      return row ? mapRow(row) : null;
    },
  };
}
