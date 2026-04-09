import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { env, isS3MediaEnabled } from "@/config/env";
import { getPool } from "@/infra/db/client";
import { logger } from "@/infra/logging/logger";
import { pgFolderExists } from "@/infra/repos/mediaFoldersRepo";
import { insertUploadSessionTx } from "@/infra/repos/mediaUploadSessionsRepo";
import { insertPendingMediaFileTx } from "@/infra/repos/s3MediaStorage";
import { s3AbortMultipartUpload, s3CreateMultipartUpload, s3ObjectKey } from "@/infra/s3/client";
import { withUserLifecycleLock } from "@/infra/userLifecycleLock";
import {
  chooseMultipartPartSize,
  MULTIPART_SESSION_TTL_MS,
  multipartMaxPartNumber,
} from "@/modules/media/multipartConstants";
import { getCurrentSession } from "@/modules/auth/service";
import { ALLOWED_MEDIA_MIME, MAX_MEDIA_BYTES } from "@/modules/media/uploadAllowedMime";
import { canAccessDoctor } from "@/modules/roles/service";

const bodySchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  size: z.number().int().positive(),
  folderId: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request) {
  if (!isS3MediaEnabled(env)) {
    return NextResponse.json({ ok: false, error: "s3_not_configured" }, { status: 501 });
  }

  const session = await getCurrentSession();
  if (!session || !canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
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
  if (!ALLOWED_MEDIA_MIME.has(mime)) {
    return NextResponse.json({ ok: false, error: "mime_not_allowed", mime }, { status: 415 });
  }
  if (parsed.data.size > MAX_MEDIA_BYTES) {
    return NextResponse.json({ ok: false, error: "file_too_large", maxBytes: MAX_MEDIA_BYTES }, { status: 413 });
  }

  let folderId: string | null = null;
  if (parsed.data.folderId !== undefined && parsed.data.folderId !== null) {
    const exists = await pgFolderExists(parsed.data.folderId);
    if (!exists) {
      return NextResponse.json({ ok: false, error: "folder_not_found" }, { status: 404 });
    }
    folderId = parsed.data.folderId;
  } else if (parsed.data.folderId === null) {
    folderId = null;
  }

  const mediaId = randomUUID();
  const sessionId = randomUUID();
  const key = s3ObjectKey(mediaId, parsed.data.filename);
  const readUrl = `/api/media/${mediaId}`;
  const partSizeBytes = chooseMultipartPartSize(parsed.data.size);
  const maxParts = multipartMaxPartNumber(parsed.data.size, partSizeBytes);
  const expiresAt = new Date(Date.now() + MULTIPART_SESSION_TTL_MS);

  const metadata = {
    "media-id": mediaId,
    "owner-user-id": session.user.userId,
    "expected-size": String(parsed.data.size),
  };

  let uploadId: string | null = null;
  try {
    const created = await s3CreateMultipartUpload({
      key,
      contentType: mime,
      metadata,
    });
    uploadId = created.uploadId;

    await withUserLifecycleLock(getPool(), session.user.userId, "shared", async (client) => {
      await insertPendingMediaFileTx(client, {
        id: mediaId,
        filename: parsed.data.filename,
        key,
        mimeType: mime,
        sizeBytes: parsed.data.size,
        userId: session.user.userId,
        folderId,
      });
      await insertUploadSessionTx(client, {
        sessionId,
        mediaId,
        s3Key: key,
        uploadId: created.uploadId,
        ownerUserId: session.user.userId,
        expectedSizeBytes: parsed.data.size,
        mimeType: mime,
        partSizeBytes,
        expiresAt,
      });
    });

    return NextResponse.json({
      ok: true as const,
      mediaId,
      sessionId,
      uploadId: created.uploadId,
      partSizeBytes,
      maxParts,
      expiresAt: expiresAt.toISOString(),
      readUrl,
    });
  } catch (e) {
    if (uploadId) {
      await s3AbortMultipartUpload(key, uploadId).catch(() => {
        /* best-effort */
      });
    }
    await getPool()
      .query(`DELETE FROM media_files WHERE id = $1::uuid AND status = 'pending'`, [mediaId])
      .catch(() => {
        /* ignore */
      });
    logger.error({ err: e }, "[media/multipart/init] failed");
    return NextResponse.json({ ok: false, error: "multipart_init_failed" }, { status: 500 });
  }
}
