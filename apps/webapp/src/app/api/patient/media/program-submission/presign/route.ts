import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { env, isS3MediaEnabled } from "@/config/env";
import { logger } from "@/app-layer/logging/logger";
import { getPool } from "@/app-layer/db/client";
import { withUserLifecycleLock } from "@/app-layer/locks/userLifecycleLock";
import {
  deletePendingMediaFileById,
  insertPendingProgramSubmissionMediaFileTx,
} from "@/app-layer/media/s3MediaStorage";
import { presignPutUrl, s3ObjectKey } from "@/app-layer/media/s3Client";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  MAX_PROGRAM_SUBMISSION_BYTES,
  PROGRAM_SUBMISSION_ALLOWED_MIME,
} from "@/modules/media/programSubmissionUploadLimits";
import { isPatientProgramDiscussionMediaFlowEnabled } from "@/modules/program-item-discussion/discussionFeatureGates";

const bodySchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  size: z.number().int().positive(),
});

export async function POST(request: Request) {
  if (!isS3MediaEnabled(env)) {
    return NextResponse.json({ ok: false, error: "s3_not_configured" }, { status: 501 });
  }

  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  if (!(await isPatientProgramDiscussionMediaFlowEnabled(deps))) {
    return NextResponse.json({ ok: false, error: "feature_disabled" }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const mime = parsed.data.mimeType.toLowerCase();
  if (!PROGRAM_SUBMISSION_ALLOWED_MIME.has(mime)) {
    return NextResponse.json({ ok: false, error: "mime_not_allowed", mime }, { status: 415 });
  }
  if (parsed.data.size > MAX_PROGRAM_SUBMISSION_BYTES) {
    return NextResponse.json(
      { ok: false, error: "file_too_large", maxBytes: MAX_PROGRAM_SUBMISSION_BYTES },
      { status: 413 },
    );
  }

  const mediaId = randomUUID();
  const key = s3ObjectKey(mediaId, parsed.data.filename);
  const readUrl = `/api/media/${mediaId}`;

  try {
    await withUserLifecycleLock(getPool(), gate.session.user.userId, "shared", async (client) => {
      await insertPendingProgramSubmissionMediaFileTx(client, {
        id: mediaId,
        filename: parsed.data.filename,
        key,
        mimeType: mime,
        sizeBytes: parsed.data.size,
        userId: gate.session.user.userId,
      });
    });
    const uploadUrl = await presignPutUrl(key, mime);
    return NextResponse.json({
      ok: true as const,
      mediaId,
      uploadUrl,
      readUrl,
    });
  } catch (e) {
    await deletePendingMediaFileById(mediaId).catch(() => {
      /* best-effort rollback */
    });
    logger.error({ err: e }, "[patient/program-submission/presign] presign_failed");
    return NextResponse.json({ ok: false, error: "presign_failed" }, { status: 500 });
  }
}
