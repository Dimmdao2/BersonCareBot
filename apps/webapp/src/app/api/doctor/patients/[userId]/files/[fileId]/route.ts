/**
 * GET   /api/doctor/patients/[userId]/files/[fileId]  — file details + fresh presigned GET URL
 * PATCH /api/doctor/patients/[userId]/files/[fileId]  — link file to a visit
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDoctorApiSession } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { env, isS3MediaEnabled } from "@/config/env";
import { presignGetUrl } from "@/app-layer/media/s3Client";

const FILE_PRESIGN_GET_TTL = 3600;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string; fileId: string }> },
) {
  const auth = await requireDoctorApiSession();
  if (!auth.ok) return auth.response;

  const { userId, fileId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
  }
  if (!z.string().uuid().safeParse(fileId).success) {
    return NextResponse.json({ ok: false, error: "invalid_file_id" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const file = await deps.patientFiles.getFile(fileId);

  if (!file || file.patientUserId !== userId) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  let previewUrl: string | null = null;
  if (isS3MediaEnabled(env)) {
    try {
      previewUrl = await presignGetUrl(file.s3Key, FILE_PRESIGN_GET_TTL);
    } catch {
      // Non-fatal.
    }
  }

  return NextResponse.json({ ok: true, file: { ...file, previewUrl } });
}

const patchBodySchema = z.object({
  visitId: z.string().uuid(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string; fileId: string }> },
) {
  const auth = await requireDoctorApiSession();
  if (!auth.ok) return auth.response;

  const { userId, fileId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
  }
  if (!z.string().uuid().safeParse(fileId).success) {
    return NextResponse.json({ ok: false, error: "invalid_file_id" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = patchBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }

  const deps = buildAppDeps();

  // Ownership check.
  const existing = await deps.patientFiles.getFile(fileId);
  if (!existing || existing.patientUserId !== userId) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const updated = await deps.patientFiles.linkFileToVisit(fileId, parsed.data.visitId);
  if (!updated) {
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, file: updated });
}
