import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getPool } from "@/app-layer/db/client";
import { withDoctorWorkspacePrincipal } from "@/app-layer/guards/doctorWorkspacePrincipal";
import { requireDoctorWorkspaceApiContext } from "@/app-layer/guards/requireRole";
import { withUserLifecycleLock } from "@/app-layer/locks/userLifecycleLock";
import { logger } from "@/app-layer/logging/logger";
import { pgEnsureClientPatientFolder } from "@/app-layer/media/clientMediaFolders";
import { presignPutUrl, s3ObjectKey } from "@/app-layer/media/s3Client";
import { deletePendingMediaFileById, insertPendingMediaFileTx } from "@/app-layer/media/s3MediaStorage";
import { env, isS3MediaEnabled } from "@/config/env";
import { ALLOWED_MEDIA_MIME, MAX_MEDIA_BYTES } from "@/modules/media/uploadAllowedMime";
import { resolveDoctorInstanceInWorkspace } from "../../_doctorInstanceWorkspace";

const bodySchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  size: z.number().int().positive(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ instanceId: string }> },
) {
  if (!isS3MediaEnabled(env)) {
    return NextResponse.json({ ok: false, error: "s3_not_configured" }, { status: 501 });
  }
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const { instanceId } = await context.params;
  if (!z.string().uuid().safeParse(instanceId).success) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const mime = parsed.data.mimeType.toLowerCase();
  if (!ALLOWED_MEDIA_MIME.has(mime) || !mime.startsWith("video/")) {
    return NextResponse.json({ ok: false, error: "mime_not_allowed", mime }, { status: 415 });
  }
  if (parsed.data.size > MAX_MEDIA_BYTES) {
    return NextResponse.json({ ok: false, error: "file_too_large", maxBytes: MAX_MEDIA_BYTES }, { status: 413 });
  }

  const deps = buildAppDeps();
  const resolved = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    resolveDoctorInstanceInWorkspace(deps, gate.ctx, instanceId),
  );
  if (!resolved.ok) return resolved.response;

  const mediaId = randomUUID();
  const key = s3ObjectKey(mediaId, parsed.data.filename);
  try {
    await withDoctorWorkspacePrincipal(gate.ctx, async () => {
      const folder = await pgEnsureClientPatientFolder(resolved.instance.patientUserId);
      await withUserLifecycleLock(
        getPool(),
        gate.ctx.session.user.userId,
        "shared",
        async (client) => {
          await insertPendingMediaFileTx(client, {
            id: mediaId,
            filename: parsed.data.filename,
            key,
            mimeType: mime,
            sizeBytes: parsed.data.size,
            userId: gate.ctx.session.user.userId,
            folderId: folder.id,
          });
        },
      );
    });
    const uploadUrl = await presignPutUrl(key, mime);
    return NextResponse.json({
      ok: true as const,
      mediaId,
      uploadUrl,
      readUrl: `/api/media/${mediaId}`,
    });
  } catch (error) {
    await withDoctorWorkspacePrincipal(gate.ctx, () => deletePendingMediaFileById(mediaId)).catch(() => undefined);
    logger.error({ err: error }, "[doctor/individual-exercise/media-presign] presign_failed");
    return NextResponse.json({ ok: false, error: "presign_failed" }, { status: 500 });
  }
}
