/**
 * PostgreSQL implementation of LfkDiaryPort.
 * Tables: lfk_complexes, lfk_sessions (see webapp/migrations/005_lfk_complexes_and_sessions.sql).
 */
import { getPool } from "@/infra/db/client";
import type { MediaPreviewStatus } from "@/modules/media/types";
import type { LfkDiaryPort } from "@/modules/diaries/ports";
import type { LfkComplex, LfkSession } from "@/modules/diaries/types";
import { mediaPreviewUrlById } from "@/shared/lib/mediaPreviewUrls";

function rowToComplex(row: {
  id: string;
  user_id: string;
  platform_user_id?: string | null;
  title: string;
  cover_image_url?: string | null;
  cover_media_type?: string | null;
  cover_media_id?: string | null;
  preview_sm_key?: string | null;
  preview_md_key?: string | null;
  preview_status?: string | null;
  origin: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  symptom_tracking_id?: string | null;
  region_ref_id?: string | null;
  side?: string | null;
  diagnosis_text?: string | null;
  diagnosis_ref_id?: string | null;
}): LfkComplex {
  const uid =
    row.platform_user_id != null && String(row.platform_user_id).trim() !== ""
      ? String(row.platform_user_id)
      : row.user_id;
  const mid = row.cover_media_id ? String(row.cover_media_id) : null;
  const coverPreviewSmUrl = mid && row.preview_sm_key?.trim() ? mediaPreviewUrlById(mid, "sm") : null;
  const coverPreviewMdUrl = mid && row.preview_md_key?.trim() ? mediaPreviewUrlById(mid, "md") : null;
  const coverPreviewStatus = (row.preview_status ?? undefined) as MediaPreviewStatus | undefined;
  const coverKind =
    mid && row.cover_media_type === "video"
      ? ("video" as const)
      : mid
        ? ("image" as const)
        : undefined;
  return {
    id: String(row.id),
    userId: uid,
    title: row.title,
    coverImageUrl: row.cover_image_url ?? null,
    coverPreviewSmUrl,
    coverPreviewMdUrl,
    coverPreviewStatus,
    coverKind,
    origin: row.origin as "manual" | "assigned_by_specialist",
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    symptomTrackingId: row.symptom_tracking_id ? String(row.symptom_tracking_id) : null,
    regionRefId: row.region_ref_id ? String(row.region_ref_id) : null,
    side: (row.side as LfkComplex["side"]) ?? null,
    diagnosisText: row.diagnosis_text ?? null,
    diagnosisRefId: row.diagnosis_ref_id ? String(row.diagnosis_ref_id) : null,
  };
}

function rowToSession(row: {
  id: string;
  user_id: string;
  complex_id: string;
  completed_at: Date;
  source: string;
  created_at: Date;
  complex_title?: string;
  recorded_at?: Date | null;
  duration_minutes?: number | null;
  difficulty_0_10?: number | null;
  pain_0_10?: number | null;
  comment?: string | null;
}): LfkSession {
  return {
    id: String(row.id),
    userId: row.user_id,
    complexId: row.complex_id,
    completedAt: row.completed_at.toISOString(),
    source: row.source as "bot" | "webapp",
    createdAt: row.created_at.toISOString(),
    recordedAt: row.recorded_at ? row.recorded_at.toISOString() : null,
    durationMinutes: row.duration_minutes ?? null,
    difficulty0_10: row.difficulty_0_10 ?? null,
    pain0_10: row.pain_0_10 ?? null,
    comment: row.comment ?? null,
    ...(row.complex_title != null && { complexTitle: row.complex_title }),
  };
}

const COMPLEX_SELECT = `c.id, c.user_id, c.title,
  c.platform_user_id,
  cover.cover_image_url,
  cover.cover_media_type,
  cover.cover_media_id,
  cover.preview_sm_key,
  cover.preview_md_key,
  cover.preview_status,
  c.origin, c.is_active, c.created_at, c.updated_at,
  c.symptom_tracking_id, c.region_ref_id, c.side, c.diagnosis_text, c.diagnosis_ref_id`;
const COMPLEX_RETURNING = `id, user_id, title,
  platform_user_id,
  NULL::text AS cover_image_url,
  origin, is_active, created_at, updated_at,
  symptom_tracking_id, region_ref_id, side, diagnosis_text, diagnosis_ref_id`;

const SESSION_SELECT = `s.id, s.user_id, s.complex_id, s.completed_at, s.source, s.created_at, c.title AS complex_title,
  s.recorded_at, s.duration_minutes, s.difficulty_0_10, s.pain_0_10, s.comment`;

function userMatchSql(tableAlias: string, userParamIndex: number): string {
  return `(${tableAlias}.platform_user_id = $${userParamIndex}::uuid OR (${tableAlias}.platform_user_id IS NULL AND ${tableAlias}.user_id = $${userParamIndex}::text))`;
}

export const pgLfkDiaryPort: LfkDiaryPort = {
  async createComplex(params) {
    const pool = getPool();
    const now = new Date();
    const result = await pool.query(
      `INSERT INTO lfk_complexes (
         user_id, platform_user_id, title, origin, is_active, updated_at,
         symptom_tracking_id, region_ref_id, side, diagnosis_text, diagnosis_ref_id
       )
       VALUES ($1::text, $1::uuid, $2, $3, true, $4, $5, $6, $7, $8, $9)
       RETURNING ${COMPLEX_RETURNING}`,
      [
        params.userId,
        params.title,
        params.origin ?? "manual",
        now,
        params.symptomTrackingId ?? null,
        params.regionRefId ?? null,
        params.side ?? null,
        params.diagnosisText ?? null,
        params.diagnosisRefId ?? null,
      ]
    );
    return rowToComplex(result.rows[0]);
  },

  async listComplexes(userId, activeOnly = true) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT ${COMPLEX_SELECT}
       FROM lfk_complexes c
       LEFT JOIN LATERAL (
         -- cover_image_url: не использовать как preview в UI — только как source для playback; миниатюра — coverPreviewSmUrl.
         SELECT em.media_url AS cover_image_url,
                em.media_type AS cover_media_type,
                mf.id AS cover_media_id,
                mf.preview_sm_key, mf.preview_md_key, mf.preview_status
         FROM lfk_complex_exercises ce
         INNER JOIN lfk_exercise_media em ON em.exercise_id = ce.exercise_id
         -- TEMP: parsing media_id из media_url, будет заменено на нормальный FK media_id
         LEFT JOIN media_files mf ON mf.id = NULLIF(
           substring(trim(em.media_url) from '^/api/media/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})'),
           ''
         )::uuid
         WHERE ce.complex_id = c.id
         ORDER BY ce.sort_order ASC, em.sort_order ASC, em.created_at ASC
         LIMIT 1
       ) cover ON TRUE
       WHERE ${userMatchSql("c", 1)} ${activeOnly ? "AND c.is_active = true" : ""}
       ORDER BY c.updated_at DESC`,
      [userId]
    );
    return result.rows.map(rowToComplex);
  },

  async addSession(params) {
    const pool = getPool();
    const completedAt = new Date(params.completedAt);
    const recordedAt = params.recordedAt ? new Date(params.recordedAt) : completedAt;
    const result = await pool.query(
      `INSERT INTO lfk_sessions (
         user_id, complex_id, completed_at, source, recorded_at,
         duration_minutes, difficulty_0_10, pain_0_10, comment
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, user_id, complex_id, completed_at, source, created_at,
         recorded_at, duration_minutes, difficulty_0_10, pain_0_10, comment`,
      [
        params.userId,
        params.complexId,
        completedAt,
        params.source,
        recordedAt,
        params.durationMinutes ?? null,
        params.difficulty0_10 ?? null,
        params.pain0_10 ?? null,
        params.comment ?? null,
      ]
    );
    const row = result.rows[0];
    const complex = await pool.query(
      `SELECT title FROM lfk_complexes WHERE id = $1`,
      [params.complexId]
    );
    return rowToSession({
      ...row,
      complex_title: complex.rows[0]?.title,
    });
  },

  async listSessions(userId, limit = 50) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT ${SESSION_SELECT}
       FROM lfk_sessions s
       JOIN lfk_complexes c ON c.id = s.complex_id
       WHERE s.user_id = $1
       ORDER BY s.completed_at DESC
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows.map(rowToSession);
  },

  async getComplexForUser(params) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT ${COMPLEX_SELECT}
       FROM lfk_complexes c
       LEFT JOIN LATERAL (
         -- cover_image_url: не использовать как preview в UI — только как source для playback; миниатюра — coverPreviewSmUrl.
         SELECT em.media_url AS cover_image_url,
                em.media_type AS cover_media_type,
                mf.id AS cover_media_id,
                mf.preview_sm_key, mf.preview_md_key, mf.preview_status
         FROM lfk_complex_exercises ce
         INNER JOIN lfk_exercise_media em ON em.exercise_id = ce.exercise_id
         -- TEMP: parsing media_id из media_url, будет заменено на нормальный FK media_id
         LEFT JOIN media_files mf ON mf.id = NULLIF(
           substring(trim(em.media_url) from '^/api/media/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})'),
           ''
         )::uuid
         WHERE ce.complex_id = c.id
         ORDER BY ce.sort_order ASC, em.sort_order ASC, em.created_at ASC
         LIMIT 1
       ) cover ON TRUE
       WHERE c.id = $1 AND ${userMatchSql("c", 2)}`,
      [params.complexId, params.userId]
    );
    return result.rows[0] ? rowToComplex(result.rows[0]) : null;
  },

  async listSessionsInRange(params) {
    const lim = Math.min(params.limit ?? 2000, 5000);
    const pool = getPool();
    if (params.complexId) {
      const result = await pool.query(
        `SELECT ${SESSION_SELECT}
         FROM lfk_sessions s
         JOIN lfk_complexes c ON c.id = s.complex_id
         WHERE s.user_id = $1 AND s.complex_id = $2
           AND s.completed_at >= $3::timestamptz AND s.completed_at < $4::timestamptz
         ORDER BY s.completed_at DESC
         LIMIT $5`,
        [
          params.userId,
          params.complexId,
          params.fromCompletedAt,
          params.toCompletedAtExclusive,
          lim,
        ]
      );
      return result.rows.map(rowToSession);
    }
    const result = await pool.query(
      `SELECT ${SESSION_SELECT}
       FROM lfk_sessions s
       JOIN lfk_complexes c ON c.id = s.complex_id
       WHERE s.user_id = $1
         AND s.completed_at >= $2::timestamptz AND s.completed_at < $3::timestamptz
       ORDER BY s.completed_at DESC
       LIMIT $4`,
      [params.userId, params.fromCompletedAt, params.toCompletedAtExclusive, lim]
    );
    return result.rows.map(rowToSession);
  },

  async minCompletedAtForUser(userId) {
    const pool = getPool();
    const result = await pool.query(`SELECT MIN(completed_at) AS m FROM lfk_sessions WHERE user_id = $1`, [
      userId,
    ]);
    const m = result.rows[0]?.m as Date | null | undefined;
    return m ? m.toISOString() : null;
  },

  async getSessionForUser(params) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT ${SESSION_SELECT}
       FROM lfk_sessions s
       JOIN lfk_complexes c ON c.id = s.complex_id
       WHERE s.id = $1 AND s.user_id = $2`,
      [params.sessionId, params.userId]
    );
    return result.rows[0] ? rowToSession(result.rows[0]) : null;
  },

  async updateSession(params) {
    const pool = getPool();
    let comment = params.comment?.trim() ?? null;
    if (comment && comment.length > 200) comment = comment.slice(0, 200);
    await pool.query(
      `UPDATE lfk_sessions
       SET completed_at = $3::timestamptz,
           duration_minutes = $4,
           difficulty_0_10 = $5,
           pain_0_10 = $6,
           comment = $7
       WHERE id = $2 AND user_id = $1`,
      [
        params.userId,
        params.sessionId,
        params.completedAt,
        params.durationMinutes ?? null,
        params.difficulty0_10 ?? null,
        params.pain0_10 ?? null,
        comment,
      ]
    );
  },

  async deleteSession(params) {
    const pool = getPool();
    await pool.query(`DELETE FROM lfk_sessions WHERE id = $2 AND user_id = $1`, [
      params.userId,
      params.sessionId,
    ]);
  },
};
