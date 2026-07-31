/**
 * Pg implementation of PatientFilesPort.
 * Uses Drizzle ORM; no business logic here.
 */

import { and, eq, asc, sql } from 'drizzle-orm';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { runDrizzleMutationTransaction } from '@/infra/db/drizzleMutationTx';
import type {
  CreatePatientFileParams,
  PatientFileCategory,
  PatientFileRecord,
  PatientFilesPort,
} from '@/modules/patient-files/ports';
import { assertStockQuotaAvailable } from '@/infra/repos/stockQuotaCheck';
import { patientFiles } from '../../../db/schema/patientFiles';
import { mediaFiles } from '../../../db/schema/schema';
import { clinicalVisit } from '../../../db/schema/patientClinical';

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
    mediaFileId: row.mediaFileId ?? null,
    uploadedByUserId: row.uploadedByUserId,
    createdAt: row.createdAt,
  };
}

function currentPrincipalOrganizationId(): string {
  const principalOrganizationId = getCurrentDbPrincipalOrganizationId();
  if (!principalOrganizationId) {
    throw new Error('organization_principal_required');
  }
  return principalOrganizationId;
}

function currentWriteOrganizationId(...fallbacks: (string | null | undefined)[]): string {
  const principalOrganizationId = currentPrincipalOrganizationId();
  const fallbackOrganizationIds = fallbacks.filter((x): x is string => Boolean(x));
  const fallbackOrganizationId = fallbackOrganizationIds[0] ?? null;
  const hasFallbackMismatch = fallbackOrganizationIds.some((id) => id !== fallbackOrganizationId);
  if (
    hasFallbackMismatch ||
    (fallbackOrganizationId && principalOrganizationId !== fallbackOrganizationId)
  ) {
    throw new Error('organization_principal_mismatch');
  }
  return principalOrganizationId;
}

export function createPgPatientFilesPort(): PatientFilesPort {
  return {
    async listFiles(
      patientUserId: string,
      category?: PatientFileCategory,
    ): Promise<PatientFileRecord[]> {
      const organizationId = currentPrincipalOrganizationId();
      const db = getDrizzle();
      const conditions = [
        eq(patientFiles.patientUserId, patientUserId),
        eq(patientFiles.organizationId, organizationId),
      ];
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
      const organizationId = currentPrincipalOrganizationId();
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(patientFiles)
        .where(and(eq(patientFiles.id, id), eq(patientFiles.organizationId, organizationId)))
        .limit(1);
      return rows[0] ? mapRow(rows[0]) : null;
    },

    async createFile(params: CreatePatientFileParams): Promise<PatientFileRecord> {
      const organizationId = currentWriteOrganizationId();
      const inserted = await runDrizzleMutationTransaction(async (tx) => {
        // Both the recount and insert are serialized by organization, so two uploads cannot each
        // consume the same final bytes. `files` usage is a live SUM, not a stored counter, so a
        // deleted row already shrinks it for the next check — no separate release step needed.
        await assertStockQuotaAvailable(
          tx,
          organizationId,
          'files',
          async () => {
            const [usage] = await tx
              .select({ usedBytes: sql<number>`COALESCE(SUM(${patientFiles.sizeBytes}), 0)::bigint` })
              .from(patientFiles)
              .where(eq(patientFiles.organizationId, organizationId));
            return Number(usage?.usedBytes ?? 0);
          },
          params.sizeBytes,
        );
        // When a folderId is provided, co-create a media_files entry so the upload
        // appears in the patient's «Пациенты» media library folder (PFI-ST-04).
        let mediaFileId: string | null = null;
        if (params.folderId) {
          const [mf] = await tx
            .insert(mediaFiles)
            .values({
              organizationId,
              displayName: params.fileName,
              originalName: params.fileName,
              storedPath: params.s3Key,
              s3Key: params.s3Key,
              mimeType: params.mimeType,
              sizeBytes: params.sizeBytes,
              uploadedBy: params.uploadedByUserId,
              folderId: params.folderId,
              status: 'ready',
              previewStatus: 'pending',
            })
            .returning({ id: mediaFiles.id });
          mediaFileId = mf?.id ?? null;
        }
        return tx
          .insert(patientFiles)
          .values({
            organizationId,
            patientUserId: params.patientUserId,
            category: params.category,
            fileName: params.fileName,
            s3Key: params.s3Key,
            s3Bucket: params.s3Bucket,
            mimeType: params.mimeType,
            sizeBytes: params.sizeBytes,
            uploadedByUserId: params.uploadedByUserId,
            mediaFileId,
          })
          .returning();
      });
      const row = inserted[0];
      if (!row) throw new Error('patient_files insert failed');
      return mapRow(row);
    },

    async linkFileToVisit(id: string, visitId: string): Promise<PatientFileRecord | null> {
      currentPrincipalOrganizationId();
      const updated = await runDrizzleMutationTransaction(async (tx) => {
        const [existing] = await tx
          .select({
            organizationId: patientFiles.organizationId,
            patientUserId: patientFiles.patientUserId,
          })
          .from(patientFiles)
          .where(eq(patientFiles.id, id))
          .limit(1);
        if (!existing) return [];
        const organizationId = currentWriteOrganizationId(existing.organizationId);
        const [visit] = await tx
          .select({
            organizationId: clinicalVisit.organizationId,
            patientUserId: clinicalVisit.patientUserId,
          })
          .from(clinicalVisit)
          .where(eq(clinicalVisit.id, visitId))
          .limit(1);
        if (!visit) return [];
        currentWriteOrganizationId(visit.organizationId);
        if (visit.patientUserId !== existing.patientUserId) {
          throw new Error('patient_file_visit_patient_mismatch');
        }
        return tx
          .update(patientFiles)
          .set({ visitId, organizationId })
          .where(and(eq(patientFiles.id, id), eq(patientFiles.organizationId, organizationId)))
          .returning();
      });
      const row = updated[0];
      return row ? mapRow(row) : null;
    },

    async renameFile(id: string, fileName: string): Promise<PatientFileRecord | null> {
      currentPrincipalOrganizationId();
      const updated = await runDrizzleMutationTransaction(async (tx) => {
        const [existing] = await tx
          .select({ organizationId: patientFiles.organizationId })
          .from(patientFiles)
          .where(eq(patientFiles.id, id))
          .limit(1);
        if (!existing) return [];
        const organizationId = currentWriteOrganizationId(existing.organizationId);
        return tx
          .update(patientFiles)
          .set({ fileName, organizationId })
          .where(and(eq(patientFiles.id, id), eq(patientFiles.organizationId, organizationId)))
          .returning();
      });
      const row = updated[0];
      return row ? mapRow(row) : null;
    },
  };
}
