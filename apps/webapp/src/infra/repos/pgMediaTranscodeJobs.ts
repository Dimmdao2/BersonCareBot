import { eq, sql } from "drizzle-orm";
import { getWebappSqlDb, runWebappSql, runWebappTransaction } from "@/infra/db/runWebappSql";
import { mediaReadableStatusPredicate } from "@/infra/repos/mediaSqlPredicates";
import { mediaFiles, mediaTranscodeJobs } from "../../../db/schema/schema";

export type EnqueueTranscodeResult =
  | { ok: true; kind: "queued"; jobId: string; alreadyQueued: boolean }
  | { ok: true; kind: "already_ready" }
  | {
      ok: false;
      error: "not_found" | "not_video" | "not_readable" | "no_s3_key";
    };

type MediaRowForEnqueue = {
  id: string;
  mime_type: string;
  s3_key: string | null;
  hls_master_playlist_s3_key: string | null;
  video_processing_status: string | null;
  usage_purpose: string | null;
};

async function loadMediaForEnqueue(mediaId: string): Promise<MediaRowForEnqueue | null | "not_found"> {
  const res = await runWebappSql<MediaRowForEnqueue>(
    getWebappSqlDb(),
    sql`SELECT id, mime_type, s3_key, hls_master_playlist_s3_key, video_processing_status, usage_purpose
     FROM media_files
     WHERE id = ${mediaId}::uuid AND ${mediaReadableStatusPredicate}`,
  );
  const row = res.rows[0];
  if (row) return row;
  const exists = await runWebappSql<{ one: number }>(
    getWebappSqlDb(),
    sql`SELECT 1 AS one FROM media_files WHERE id = ${mediaId}::uuid LIMIT 1`,
  );
  if (!exists.rows[0]) return "not_found";
  return null;
}

async function findActiveTranscodeJobId(mediaId: string): Promise<string | null> {
  const dup = await runWebappSql<{ id: string }>(
    getWebappSqlDb(),
    sql`SELECT id FROM media_transcode_jobs
     WHERE media_id = ${mediaId}::uuid AND status IN ('pending', 'processing')
     LIMIT 1`,
  );
  return dup.rows[0]?.id ?? null;
}

async function insertTranscodeJobAndMarkPending(mediaId: string): Promise<EnqueueTranscodeResult> {
  const existingId = await findActiveTranscodeJobId(mediaId);
  if (existingId) {
    return { ok: true, kind: "queued", jobId: existingId, alreadyQueued: true };
  }

  try {
    return await runWebappTransaction(async (tx) => {
      const ins = await tx
        .insert(mediaTranscodeJobs)
        .values({
          mediaId,
          status: "pending",
          attempts: 0,
          createdAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .returning({ id: mediaTranscodeJobs.id });
      const jobId = ins[0]?.id;
      if (!jobId) {
        return { ok: false as const, error: "not_found" as const };
      }

      await tx
        .update(mediaFiles)
        .set({
          videoProcessingStatus: "pending",
          videoProcessingError: null,
        })
        .where(eq(mediaFiles.id, mediaId));

      return { ok: true as const, kind: "queued" as const, jobId, alreadyQueued: false };
    });
  } catch (e: unknown) {
    const err = e as { code?: string; cause?: { code?: string } };
    const pgCode = err.code ?? err.cause?.code;
    if (pgCode === "23505") {
      const again = await findActiveTranscodeJobId(mediaId);
      if (again) {
        return { ok: true, kind: "queued", jobId: again, alreadyQueued: true };
      }
    }
    throw e;
  }
}

/**
 * Idempotent enqueue: at most one active job per media (DB partial unique index).
 * Call only when `video_hls_pipeline_enabled` is true (checked by caller).
 */
export async function enqueueMediaTranscodeJob(mediaId: string): Promise<EnqueueTranscodeResult> {
  const loaded = await loadMediaForEnqueue(mediaId);
  if (loaded === "not_found") return { ok: false, error: "not_found" };
  if (!loaded) return { ok: false, error: "not_readable" };

  if (!loaded.s3_key?.trim()) return { ok: false, error: "no_s3_key" };
  if (!loaded.mime_type.toLowerCase().startsWith("video/")) {
    return { ok: false, error: "not_video" };
  }

  if (loaded.hls_master_playlist_s3_key?.trim() && loaded.video_processing_status === "ready") {
    return { ok: true, kind: "already_ready" };
  }

  return insertTranscodeJobAndMarkPending(mediaId);
}

/**
 * Enqueue 480p progressive transcode for patient program submission video.
 * Not gated by HLS pipeline flags — caller ensures usage_purpose=program_item_submission.
 */
export async function enqueueProgramSubmissionTranscodeJob(mediaId: string): Promise<EnqueueTranscodeResult> {
  const loaded = await loadMediaForEnqueue(mediaId);
  if (loaded === "not_found") return { ok: false, error: "not_found" };
  if (!loaded) return { ok: false, error: "not_readable" };

  if (loaded.usage_purpose !== "program_item_submission") {
    return { ok: false, error: "not_found" };
  }

  if (!loaded.s3_key?.trim()) return { ok: false, error: "no_s3_key" };
  if (!loaded.mime_type.toLowerCase().startsWith("video/")) {
    return { ok: false, error: "not_video" };
  }

  if (loaded.video_processing_status === "ready") {
    return { ok: true, kind: "already_ready" };
  }

  return insertTranscodeJobAndMarkPending(mediaId);
}
