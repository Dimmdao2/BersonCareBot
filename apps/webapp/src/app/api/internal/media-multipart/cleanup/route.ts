import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { getPool } from "@/infra/db/client";
import { logger } from "@/infra/logging/logger";
import { withMultipartSessionLock } from "@/infra/multipartSessionLock";
import {
  listExpiredActiveUploadSessions,
  markUploadSessionExpired,
  markUploadSessionExpiredTx,
} from "@/infra/repos/mediaUploadSessionsRepo";
import { s3AbortMultipartUpload } from "@/infra/s3/client";

function bearerMatchesSecret(token: string, secret: string): boolean {
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * Expired multipart sessions: AbortMultipartUpload + remove pending media (cascade removes session rows).
 */
export async function POST(request: Request) {
  const secret = env.INTERNAL_JOB_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || !bearerMatchesSecret(token, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let limit = 25;
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("limit");
    if (q) limit = Number.parseInt(q, 10);
  } catch {
    /* ignore */
  }

  const pool = getPool();
  let cleaned = 0;
  let errors = 0;

  try {
    const rows = await listExpiredActiveUploadSessions(Number.isFinite(limit) ? limit : 25);
    for (const row of rows) {
      try {
        const keys = await withMultipartSessionLock(pool, row.id, async (client) => {
          const sel = await client.query<{
            id: string;
            media_id: string;
            s3_key: string;
            upload_id: string;
          }>(
            `SELECT id, media_id, s3_key, upload_id
               FROM media_upload_sessions
              WHERE id = $1::uuid
                AND status IN ('initiated', 'uploading', 'completing')
                AND expires_at <= now()
              FOR UPDATE`,
            [row.id],
          );
          const s = sel.rows[0];
          if (!s) {
            return null;
          }
          const del = await client.query(`DELETE FROM media_files WHERE id = $1::uuid AND status = 'pending'`, [
            s.media_id,
          ]);
          if ((del.rowCount ?? 0) === 0) {
            await markUploadSessionExpiredTx(client, s.id);
            return null;
          }
          return { s3Key: s.s3_key, uploadId: s.upload_id };
        });

        if (keys) {
          await s3AbortMultipartUpload(keys.s3Key, keys.uploadId).catch(() => {
            /* best-effort */
          });
        }
        cleaned += 1;
      } catch (e) {
        errors += 1;
        logger.error({ err: e, sessionId: row.id }, "[internal/media-multipart/cleanup] row_failed");
        await markUploadSessionExpired(row.id).catch(() => {
          /* ignore */
        });
      }
    }
    return NextResponse.json({ ok: true, cleaned, errors });
  } catch (e) {
    logger.error({ err: e }, "[internal/media-multipart/cleanup] failed");
    return NextResponse.json({ ok: false, error: "cleanup_failed" }, { status: 500 });
  }
}
