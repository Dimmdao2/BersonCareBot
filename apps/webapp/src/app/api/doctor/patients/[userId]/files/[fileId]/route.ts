/**
 * GET   /api/doctor/patients/[userId]/files/[fileId]  — file details + fresh presigned GET URL
 * PATCH /api/doctor/patients/[userId]/files/[fileId]  — link file to a visit
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import {
  requireDoctorWorkspaceModuleForApi,
  resolveWorkspaceModulesForApi,
} from '@/app-layer/guards/workspaceModuleAccess';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { env, isS3MediaEnabled } from '@/config/env';
import { resolveInlineMediaDeliveryUrl } from '@/app-layer/media/resolveInlineMediaDeliveryUrl';
import { runWithMechanicWriteClearance } from '@/app-layer/entitlements/mechanicWriteClearance';

const FILE_PRESIGN_GET_TTL = 3600;

function isPatientFileScopeError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === 'organization_principal_mismatch' ||
      error.message === 'organization_principal_required' ||
      error.message === 'patient_file_visit_patient_mismatch')
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string; fileId: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { userId, fileId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user_id' }, { status: 400 });
  }
  if (!z.string().uuid().safeParse(fileId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_file_id' }, { status: 400 });
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
  const file = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.patientFiles.getFile(fileId),
  );

  if (!file || file.patientUserId !== patientUserId) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const workspaceModules = await resolveWorkspaceModulesForApi(gate.ctx, deps);

  let previewUrl: string | null = null;
  if (isS3MediaEnabled(env)) {
    try {
      previewUrl = await resolveInlineMediaDeliveryUrl(
        file.mediaFileId,
        file.mimeType,
        FILE_PRESIGN_GET_TTL,
        file.fileName,
      );
    } catch {
      // Non-fatal.
    }
  }

  return NextResponse.json({
    ok: true,
    file: { ...file, visitId: workspaceModules.encounters ? file.visitId : null, previewUrl },
  });
}

/**
 * DELETE /api/doctor/patients/[userId]/files/[fileId]
 *
 * Deletes the S3 object before the canonical row: the row is only removed once the object is
 * confirmed gone (or S3 is disabled). A storage failure returns 502 and keeps the row instead of
 * claiming success — the object is staged for the shared retry purge in that case.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ userId: string; fileId: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { userId, fileId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user_id' }, { status: 400 });
  }
  if (!z.string().uuid().safeParse(fileId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_file_id' }, { status: 400 });
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
  const file = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.patientFiles.getFile(fileId),
  );
  if (!file || file.patientUserId !== identity.userId) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  const confirmUsed = new URL(request.url).searchParams.get('confirmUsed') === 'true';
  const mediaFileId = file.mediaFileId;
  if (mediaFileId) {
    const usage = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.media.findUsage(mediaFileId),
    );
    if (usage.length > 0 && !confirmUsed) {
      return NextResponse.json({ ok: false, error: 'media_in_use', usage }, { status: 409 });
    }
  }

  // Deletion is the quota-recovery door and deliberately remains available when the files
  // mechanic is unavailable. Ownership was proven above; grant clearance only around this write.
  const result = await withDoctorWorkspacePrincipal(gate.ctx, 'doctor.patients.files.delete', () =>
    runWithMechanicWriteClearance('files', () => deps.patientFiles.deleteFile(fileId)),
  );
  if (result.status === 'not_found') {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  if (result.status === 'storage_delete_failed') {
    return NextResponse.json({ ok: false, error: 'storage_delete_failed' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, deleted: true });
}

const patchBodySchema = z
  .object({
    visitId: z.string().uuid().optional(),
    fileName: z.string().min(1).optional(),
  })
  .refine((d) => d.visitId !== undefined || d.fileName !== undefined, {
    message: 'at least one of visitId or fileName is required',
  });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string; fileId: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { userId, fileId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user_id' }, { status: 400 });
  }
  if (!z.string().uuid().safeParse(fileId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_file_id' }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const parsed = patchBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    );
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

  // Ownership check.
  const existing = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.patientFiles.getFile(fileId),
  );
  if (!existing || existing.patientUserId !== patientUserId) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  if (parsed.data.visitId !== undefined) {
    const moduleGate = await requireDoctorWorkspaceModuleForApi(deps, gate.ctx, 'encounters');
    if (!moduleGate.ok) return moduleGate.response;
  }
  const entitlement = await requireEntitlementForMutation(gate.ctx, 'files');
  if (!entitlement.ok) return entitlement.response;

  let updated: Awaited<ReturnType<typeof deps.patientFiles.getFile>> = existing;

  try {
    const visitId = parsed.data.visitId;
    if (visitId !== undefined) {
      updated = await withDoctorWorkspacePrincipal(gate.ctx, 'doctor.patients.files.link', () =>
        deps.patientFiles.linkFileToVisit(fileId, visitId),
      );
      if (!updated) {
        return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
      }
    }

    const fileName = parsed.data.fileName;
    if (fileName !== undefined) {
      updated = await withDoctorWorkspacePrincipal(gate.ctx, 'doctor.patients.files.rename', () =>
        deps.patientFiles.renameFile(fileId, fileName),
      );
    }
  } catch (error) {
    if (isPatientFileScopeError(error)) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    throw error;
  }

  if (!updated) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, file: updated });
}
