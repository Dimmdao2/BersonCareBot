import type { Pool } from "pg";
import { probeVideoDurationSeconds } from "./ffmpeg/probeVideoDurationSeconds.js";
import type { Logger } from "./logger.js";
import { runMediaWorkerPgText } from "./runMediaWorkerSql.js";

export async function persistVideoDurationSecondsIfMissing(
  pool: Pool,
  mediaId: string,
  durationSeconds: number | null,
): Promise<void> {
  if (durationSeconds == null || durationSeconds <= 0) return;
  await runMediaWorkerPgText(
    pool,
    `UPDATE public.media_files
     SET video_duration_seconds = $2
     WHERE id = $1::uuid
       AND (video_duration_seconds IS NULL OR video_duration_seconds <= 0)`,
    [mediaId, durationSeconds],
  );
}

/** Probe local file and persist duration when still missing in DB. */
export async function probeAndPersistVideoDurationSeconds(
  pool: Pool,
  params: {
    mediaId: string;
    localPath: string;
    ffmpegBin: string;
    timeoutMs: number;
    log: Logger;
  },
): Promise<number | null> {
  const seconds = await probeVideoDurationSeconds(params.ffmpegBin, params.localPath, params.timeoutMs);
  if (seconds == null) return null;
  await persistVideoDurationSecondsIfMissing(pool, params.mediaId, seconds);
  return seconds;
}
