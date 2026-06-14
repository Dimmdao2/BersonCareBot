/**
 * GET  /api/doctor/patients/[userId]/files?category=
 * POST /api/doctor/patients/[userId]/files  — create file metadata + presigned PUT URL
 *
 * S3 approach:
 *   GET list: returns list of file records + per-file presigned GET URL for preview.
 *   POST create: inserts metadata row + returns presigned PUT URL for direct browser upload.
 *   // TODO(upload): large file multipart support if needed.
 */

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDoctorApiSession } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { env, isS3MediaEnabled } from "@/config/env";
import { presignGetUrl, presignPutUrl } from "@/app-layer/media/s3Client";
import type { PatientFileCategory } from "@/modules/patient-files/ports";
import { PATIENT_FILE_CATEGORIES } from "@/modules/patient-files/ports";

const FILE_PRESIGN_GET_TTL = 3600; // 1 hour

const categorySchema = z.enum(
  PATIENT_FILE_CATEGORIES as [PatientFileCategory, ...PatientFileCategory[]],
);

const createBodySchema = z.object({
  category: categorySchema,
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(127),
  sizeBytes: z.number().int().positive(),
});

function sanitizeFilename(name: string): string {
  const base = name.replace(/\.\./g, "").replace(/\s+/g, "_").slice(0, 200);
  const cleaned = base.replace(/[^a-zA-Z0-9._\-]/g, "_");
  return cleaned.length > 0 ? cleaned : "file";
}

function patientFileS3Key(fileId: string, fileName: string): string {
  const safe = sanitizeFilename(fileName);
  return `patient-files/${fileId}/${safe}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const auth = await requireDoctorApiSession();
  if (!auth.ok) return auth.response;

  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
  }

  const url = new URL(request.url);
  const rawCategory = url.searchParams.get("category");
  let category: PatientFileCategory | undefined;
  if (rawCategory) {
    const parsed = categorySchema.safeParse(rawCategory);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "invalid_category" }, { status: 400 });
    }
    category = parsed.data;
  }

  const deps = buildAppDeps();
  const files = await deps.patientFiles.listFiles(userId, category);

  // Attach presigned GET URLs for preview/download when S3 is configured.
  const s3Available = isS3MediaEnabled(env);
  const filesWithUrls = await Promise.all(
    files.map(async (f) => {
      let previewUrl: string | null = null;
      if (s3Available) {
        try {
          previewUrl = await presignGetUrl(f.s3Key, FILE_PRESIGN_GET_TTL);
        } catch {
          // Non-fatal: file may not exist in S3 yet.
        }
      }
      return { ...f, previewUrl };
    }),
  );

  return NextResponse.json({ ok: true, files: filesWithUrls });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const auth = await requireDoctorApiSession();
  if (!auth.ok) return auth.response;

  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = createBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }

  const { category, fileName, mimeType, sizeBytes } = parsed.data;
  const fileId = randomUUID();
  const s3Key = patientFileS3Key(fileId, fileName);
  const s3Bucket = env.S3_PRIVATE_BUCKET ?? "bersonservices-private";

  const deps = buildAppDeps();
  const file = await deps.patientFiles.createFile({
    patientUserId: userId,
    category,
    fileName,
    s3Key,
    s3Bucket,
    mimeType,
    sizeBytes,
    uploadedByUserId: auth.session.user.userId,
  });

  // TODO(upload): return presigned PUT URL for direct browser upload when S3 is available.
  let uploadUrl: string | null = null;
  if (isS3MediaEnabled(env)) {
    try {
      uploadUrl = await presignPutUrl(s3Key, mimeType);
    } catch {
      // Non-fatal: metadata saved; client can retry presign.
    }
  }

  return NextResponse.json({ ok: true, file, uploadUrl }, { status: 201 });
}
