/**
 * PostgreSQL implementation of LfkDiaryPort.
 * Tables: lfk_complexes, lfk_sessions (see webapp/migrations/005_lfk_complexes_and_sessions.sql).
 */
import { getPool } from "@/infra/db/client";
import type { LfkDiaryPort } from "@/modules/diaries/ports";
import type { LfkComplex, LfkSession } from "@/modules/diaries/types";

function rowToComplex(row: {
  id: string;
  user_id: string;
  title: string;
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
  return {
    id: String(row.id),
    userId: row.user_id,
    title: row.title,
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

const COMPLEX_SELECT = `id, user_id, title, origin, is_active, created_at, updated_at,
  symptom_tracking_id, region_ref_id, side, diagnosis_text, diagnosis_ref_id`;

const SESSION_SELECT = `s.id, s.user_id, s.complex_id, s.completed_at, s.source, s.created_at, c.title AS complex_title,
  s.recorded_at, s.duration_minutes, s.difficulty_0_10, s.pain_0_10, s.comment`;

export const pgLfkDiaryPort: LfkDiaryPort = {
  async createComplex(params) {
    const pool = getPool();
    const now = new Date();
    const result = await pool.query(
      `INSERT INTO lfk_complexes (
         user_id, title, origin, is_active, updated_at,
         symptom_tracking_id, region_ref_id, side, diagnosis_text, diagnosis_ref_id
       )
       VALUES ($1, $2, $3, true, $4, $5, $6, $7, $8, $9)
       RETURNING ${COMPLEX_SELECT}`,
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
       FROM lfk_complexes
       WHERE user_id = $1 ${activeOnly ? "AND is_active = true" : ""}
       ORDER BY updated_at DESC`,
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
      `SELECT ${COMPLEX_SELECT} FROM lfk_complexes WHERE id = $1 AND user_id = $2`,
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
