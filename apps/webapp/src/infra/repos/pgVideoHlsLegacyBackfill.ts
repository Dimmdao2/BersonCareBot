import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { getPool } from '@/infra/db/client';
import { runPgPoolSql } from '@/infra/db/runWebappSql';
import {
  legacyHlsBackfillCandidateWhereClause,
  mediaReadableSql,
} from '@/infra/repos/mediaHlsLegacySqlFilters';

export type VideoHlsLegacyBackfillCandidateRow = {
  id: string;
  size_bytes: string | null;
};

export type VideoHlsLegacyStatusHistogramRow = {
  status: string;
  count: string;
};

export type VideoHlsLegacyFailedReasonRow = {
  video_processing_error: string | null;
  count: string;
};

export type VideoHlsLegacyBackfillReadRepo = {
  fetchBatch(opts: {
    batchSize: number;
    cursorAfterMediaId: string | null;
    cutoffCreatedBefore: Date | null;
    includeFailed: boolean;
  }): Promise<VideoHlsLegacyBackfillCandidateRow[]>;
  loadHistogram(): Promise<VideoHlsLegacyStatusHistogramRow[]>;
  loadFailedReasons(): Promise<VideoHlsLegacyFailedReasonRow[]>;
};

export function createPgVideoHlsLegacyBackfillReadRepo(
  pool: Pool = getPool(),
): VideoHlsLegacyBackfillReadRepo {
  return {
    async fetchBatch(opts) {
      const coreWhere = legacyHlsBackfillCandidateWhereClause('m', opts.includeFailed);
      const r = await runPgPoolSql<VideoHlsLegacyBackfillCandidateRow>(
        pool,
        sql`SELECT m.id::text AS id, m.size_bytes::text AS size_bytes
         FROM media_files m
         WHERE ${sql.raw(coreWhere)}
           AND (${opts.cursorAfterMediaId}::uuid IS NULL OR m.id > ${opts.cursorAfterMediaId}::uuid)
           AND (${opts.cutoffCreatedBefore ? opts.cutoffCreatedBefore.toISOString() : null}::timestamptz IS NULL OR m.created_at < ${opts.cutoffCreatedBefore ? opts.cutoffCreatedBefore.toISOString() : null}::timestamptz)
         ORDER BY m.id ASC
         LIMIT ${opts.batchSize}::int`,
      );
      return r.rows;
    },

    async loadHistogram() {
      const r = await runPgPoolSql<VideoHlsLegacyStatusHistogramRow>(
        pool,
        sql`SELECT COALESCE(m.video_processing_status::text, '(null)') AS status, COUNT(*)::text AS count
         FROM media_files m
         WHERE m.mime_type ILIKE 'video/%'
           AND ${sql.raw(mediaReadableSql('m'))}
         GROUP BY 1
         ORDER BY 1`,
      );
      return r.rows;
    },

    async loadFailedReasons() {
      const r = await runPgPoolSql<VideoHlsLegacyFailedReasonRow>(
        pool,
        sql`SELECT m.video_processing_error, COUNT(*)::text AS count
         FROM media_files m
         WHERE m.mime_type ILIKE 'video/%'
           AND ${sql.raw(mediaReadableSql('m'))}
           AND m.video_processing_status = 'failed'
         GROUP BY 1
         ORDER BY COUNT(*) DESC
         LIMIT 25`,
      );
      return r.rows;
    },
  };
}
