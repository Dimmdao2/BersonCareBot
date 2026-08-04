/**
 * Pg implementation of PatientFilesPort.
 * Uses Drizzle ORM; no business logic here.
 */

import { and, eq, asc, isNull, or, sql } from 'drizzle-orm';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { runDrizzleMutationTransaction } from '@/infra/db/drizzleMutationTx';
import type {
  CreatePatientFileParams,
  DeletePatientFileResult,
  PatientFileCategory,
  PatientFileRecord,
  PatientFilesPort,
} from '@/modules/patient-files/ports';
import { assertReceivedUpload, type ReceivedUpload } from '@/modules/media/uploadValidation';
import { transactionQuotaPort } from '@/infra/repos/transactionQuotaPort';
import { env, isS3MediaEnabled } from '@/config/env';
import { s3DeleteObject } from '@/infra/s3/client';
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

async function countStorageUsedBytes(
  db: Pick<ReturnType<typeof getDrizzle>, 'select'>,
  organizationId: string,
): Promise<number> {
  const [usage] = await db
    .select({ usedBytes: sql<number>`COALESCE(SUM(${patientFiles.sizeBytes}), 0)::bigint` })
    .from(patientFiles)
    .leftJoin(mediaFiles, eq(patientFiles.mediaFileId, mediaFiles.id))
    .where(
      and(
        eq(patientFiles.organizationId, organizationId),
        or(isNull(patientFiles.mediaFileId), eq(mediaFiles.status, 'ready')),
      ),
    );
  return Number(usage?.usedBytes ?? 0);
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
        .select({ file: patientFiles, mediaStatus: mediaFiles.status })
        .from(patientFiles)
        .leftJoin(mediaFiles, eq(patientFiles.mediaFileId, mediaFiles.id))
        .where(and(...conditions))
        .orderBy(asc(patientFiles.createdAt));
      return rows
        .filter((row) => !row.file.mediaFileId || row.mediaStatus === 'ready')
        .map((row) => mapRow(row.file));
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
        // A pending row is deliberately outside the quota and list projection. The received-door
        // below charges the actual bytes atomically with its ready transition.
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
              status: 'pending',
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

    async confirmFileUpload(
      mediaFileId: string,
      received: ReceivedUpload,
    ): Promise<PatientFileRecord | null> {
      assertReceivedUpload(received);
      const organizationId = currentPrincipalOrganizationId();
      const rows = await runDrizzleMutationTransaction(async (tx) => {
        const [existing] = await tx
          .select({ file: patientFiles, mediaStatus: mediaFiles.status })
          .from(patientFiles)
          .innerJoin(mediaFiles, eq(patientFiles.mediaFileId, mediaFiles.id))
          .where(
            and(
              eq(patientFiles.mediaFileId, mediaFileId),
              eq(patientFiles.organizationId, organizationId),
              eq(mediaFiles.organizationId, organizationId),
            ),
          )
          .limit(1);
        if (!existing || existing.mediaStatus !== 'pending') return [];
        if (
          existing.file.mimeType !== received.intent.mimeType ||
          Number(existing.file.sizeBytes) !== received.intent.sizeBytes
        ) {
          return [];
        }
        await transactionQuotaPort.withinLock(
          tx,
          { organizationId, mechanic: 'files' },
          (quota) =>
            quota.assertStockAvailable(
              () => countStorageUsedBytes(tx, organizationId),
              received.intent.sizeBytes,
            ),
        );
        const [ready] = await tx
          .update(mediaFiles)
          .set({ status: 'ready' })
          .where(
            and(
              eq(mediaFiles.id, mediaFileId),
              eq(mediaFiles.organizationId, organizationId),
              eq(mediaFiles.status, 'pending'),
            ),
          )
          .returning({ id: mediaFiles.id });
        if (!ready) return [];
        return tx
          .update(patientFiles)
          .set({ sizeBytes: received.intent.sizeBytes })
          .where(
            and(
              eq(patientFiles.mediaFileId, mediaFileId),
              eq(patientFiles.organizationId, organizationId),
            ),
          )
          .returning();
      });
      return rows[0] ? mapRow(rows[0]) : null;
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

    async deleteFile(id: string): Promise<DeletePatientFileResult> {
      const organizationId = currentPrincipalOrganizationId();
      const db = getDrizzle();
      const [file] = await db
        .select()
        .from(patientFiles)
        .where(and(eq(patientFiles.id, id), eq(patientFiles.organizationId, organizationId)))
        .limit(1);
      if (!file) return { status: 'not_found' };

      const stageForRetry = () =>
        runDrizzleMutationTransaction(async (tx) => {
          if (file.mediaFileId) {
            await tx
              .update(mediaFiles)
              .set({ status: 'pending_delete' })
              .where(
                and(
                  eq(mediaFiles.id, file.mediaFileId),
                  eq(mediaFiles.organizationId, organizationId),
                ),
              );
          } else {
            await tx.insert(mediaFiles).values({
              organizationId,
              originalName: file.fileName,
              displayName: file.fileName,
              storedPath: file.s3Key,
              s3Key: file.s3Key,
              mimeType: file.mimeType,
              sizeBytes: file.sizeBytes,
              uploadedBy: file.uploadedByUserId,
              status: 'pending_delete',
              previewStatus: 'skipped',
            });
          }
        });

      if (isS3MediaEnabled(env)) {
        try {
          await s3DeleteObject(file.s3Key);
        } catch {
          // An orphaned row (recoverable, retryable) beats an orphaned object with no row left to
          // find it. Keep patient_files intact and stage the object for the shared retry purge
          // instead of reporting a deletion that didn't happen.
          await stageForRetry();
          return { status: 'storage_delete_failed' };
        }
      }

      const deleted = await runDrizzleMutationTransaction(async (tx) => {
        if (file.mediaFileId) {
          await tx
            .delete(mediaFiles)
            .where(
              and(
                eq(mediaFiles.id, file.mediaFileId),
                eq(mediaFiles.organizationId, organizationId),
              ),
            );
        }
        const rows = await tx
          .delete(patientFiles)
          .where(and(eq(patientFiles.id, id), eq(patientFiles.organizationId, organizationId)))
          .returning({ id: patientFiles.id });
        return rows.length === 1;
      });
      return deleted ? { status: 'deleted' } : { status: 'not_found' };
    },

    async getStorageUsedBytes(): Promise<number> {
      const organizationId = currentPrincipalOrganizationId();
      return countStorageUsedBytes(getDrizzle(), organizationId);
    },
  };
}
