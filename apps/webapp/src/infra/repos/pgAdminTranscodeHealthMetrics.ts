import { runWebappPgText } from "@/infra/db/runWebappSql";
import {
  legacyHlsBackfillCandidateWhereClause,
  legacyHlsReconcileEligibleForEnqueueSqlFilter,
  mediaReadableSql,
  VIDEO_HLS_LEGACY_MAX_OBJECT_BYTES,
} from "@/infra/repos/mediaHlsLegacySqlFilters";

function parseCountText(raw: string | undefined): number {
  if (raw == null || raw.trim().length === 0) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

export async function loadAdminTranscodeMediaFileCounts(): Promise<{
  legacyReconcileCandidateCountWithinSizeCap: number;
  readableVideoReadyWithHlsCount: number;
}> {
  const core = legacyHlsBackfillCandidateWhereClause("m", false);
  const sz = legacyHlsReconcileEligibleForEnqueueSqlFilter("m", VIDEO_HLS_LEGACY_MAX_OBJECT_BYTES);
  const readable = mediaReadableSql("m");

  const [candidatesResult, readyHlsResult] = await Promise.all([
    runWebappPgText<{ c: string }>(
      `SELECT count(*)::text AS c FROM media_files m WHERE ${core} AND ${sz}`,
    ),
    runWebappPgText<{ c: string }>(
      `SELECT count(*)::text AS c
       FROM media_files m
       WHERE m.mime_type ILIKE 'video/%'
         AND ${readable}
         AND m.video_processing_status = 'ready'
         AND m.hls_master_playlist_s3_key IS NOT NULL
         AND trim(m.hls_master_playlist_s3_key) <> ''`,
    ),
  ]);

  return {
    legacyReconcileCandidateCountWithinSizeCap: parseCountText(candidatesResult.rows[0]?.c),
    readableVideoReadyWithHlsCount: parseCountText(readyHlsResult.rows[0]?.c),
  };
}
