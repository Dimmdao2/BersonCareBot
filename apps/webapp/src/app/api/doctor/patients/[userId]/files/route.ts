/**
 * GET  /api/doctor/patients/[userId]/files?category=
 * POST /api/doctor/patients/[userId]/files  — create file metadata + presigned PUT URL
 *
 * S3 approach:
 *   GET list: returns list of file records + per-file presigned GET URL for preview.
 *   POST create: inserts metadata row + returns presigned PUT URL for direct browser upload.
 *   // TODO(upload): large file multipart support if needed.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { resolveFileStorageLimit } from '@/modules/org-entitlements/service';
import { env, isS3MediaEnabled } from '@/config/env';
import { presignGetUrl } from '@/app-layer/media/s3Client';
import { prepareMediaUpload, presignPreparedUpload } from '@/app-layer/media/mediaUploadAdapter';
import { uploadValidationResponse } from '@/modules/media/uploadValidation';
import type { PatientFileCategory } from '@/modules/patient-files/ports';
import { PATIENT_FILE_CATEGORIES } from '@/modules/patient-files/ports';
import { pgEnsureClientPatientFolder } from '@/app-layer/media/clientMediaFolders';

const FILE_PRESIGN_GET_TTL = 3600; // 1 hour

/** Thrown by the infra atomic quota port; compared by message, not class, to keep this route free of an infra import. */
const FILES_QUOTA_REACHED_MESSAGE = 'saas_quota_reached:files';

const categorySchema = z.enum(
  PATIENT_FILE_CATEGORIES as [PatientFileCategory, ...PatientFileCategory[]],
);

const createBodySchema = z.object({
  category: categorySchema,
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(127),
  sizeBytes: z.number().int().positive(),
});

export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user_id' }, { status: 400 });
  }

  const url = new URL(request.url);
  const rawCategory = url.searchParams.get('category');
  let category: PatientFileCategory | undefined;
  if (rawCategory) {
    const parsed = categorySchema.safeParse(rawCategory);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'invalid_category' }, { status: 400 });
    }
    category = parsed.data;
  }

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    gate.ctx.organizationId,
    gate.ctx,
  );
  if (!identity) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const patientUserId = identity.userId;
  const files = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.patientFiles.listFiles(patientUserId, category),
  );

  // Attach presigned GET URLs for preview/download when S3 is configured.
  const s3Available = isS3MediaEnabled(env);
  const filesWithUrls = await Promise.all(
    files.map(async (f) => {
      let previewUrl: string | null = null;
      if (s3Available) {
        try {
          // The type and name we validated at upload time travel with the URL, so the storage host cannot
          // decide for itself how the browser treats a patient's file.
          previewUrl = await presignGetUrl(f.s3Key, FILE_PRESIGN_GET_TTL, {
            mimeType: f.mimeType,
            filename: f.fileName,
          });
        } catch {
          // Non-fatal: file may not exist in S3 yet.
        }
      }
      return { ...f, previewUrl };
    }),
  );

  return NextResponse.json({ ok: true, files: filesWithUrls });
}

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user_id' }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const parsed = createBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { category, fileName, mimeType, sizeBytes } = parsed.data;
  const prepared = prepareMediaUpload({
    filename: fileName,
    mimeType,
    sizeBytes,
    policyId: 'patient-file',
    namespace: 'patient-files',
  });
  if (!prepared.ok) {
    const rejection = uploadValidationResponse(prepared);
    return NextResponse.json(rejection.body, { status: rejection.status });
  }
  const upload = prepared.value;

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    gate.ctx.organizationId,
    gate.ctx,
  );
  if (!identity) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const patientUserId = identity.userId;

  const entitlement = await requireEntitlementForMutation(gate.ctx, 'files');
  if (!entitlement.ok) return entitlement.response;

  const storageLimitBytes = await resolveFileStorageLimit(
    deps.orgEntitlements,
    gate.ctx.organizationId,
  );
  // A concurrent tariff edit cannot turn an omitted configuration into an unlimited upload.
  if (storageLimitBytes === undefined) {
    return NextResponse.json(
      { ok: false, error: 'file_storage_limit_not_configured' },
      { status: 403 },
    );
  }
  // Best-effort pre-check so an exhausted quota refuses before the folder side effect below;
  // the transaction inside `createFile` (transactionQuotaPort) is what actually stays
  // race-safe under concurrent uploads.
  if (storageLimitBytes !== null) {
    const usedBytes = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.patientFiles.getStorageUsedBytes(),
    );
    if (usedBytes + upload.intent.sizeBytes > storageLimitBytes) {
      return NextResponse.json({ ok: false, error: 'file_storage_limit_reached' }, { status: 403 });
    }
  }

  if (!isS3MediaEnabled(env)) {
    return NextResponse.json({ ok: false, error: 's3_not_configured' }, { status: 501 });
  }

  let uploadUrl: string;
  try {
    uploadUrl = await presignPreparedUpload(upload);
  } catch {
    return NextResponse.json({ ok: false, error: 'presign_failed' }, { status: 500 });
  }

  // Get/create the patient's «Пациенты»/<ФИО> media library folder after all no-side-effect gates.
  const patientFolder = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    pgEnsureClientPatientFolder(patientUserId),
  );

  let file;
  try {
    file = await withDoctorWorkspacePrincipal(gate.ctx, 'doctor.patients.files.create', () =>
      deps.patientFiles.createFile({
        patientUserId,
        category,
        fileName,
        s3Key: upload.key,
        s3Bucket: upload.bucket,
        mimeType: upload.intent.mimeType,
        sizeBytes: upload.intent.sizeBytes,
        uploadedByUserId: gate.ctx.session.user.userId,
        folderId: patientFolder.id,
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.message === FILES_QUOTA_REACHED_MESSAGE) {
      return NextResponse.json({ ok: false, error: 'file_storage_limit_reached' }, { status: 403 });
    }
    throw error;
  }

  // The row stays pending and absent from list/quota until PUT + confirm validate the stored object.
  return NextResponse.json({ ok: true, file, uploadUrl }, { status: 201 });
}
