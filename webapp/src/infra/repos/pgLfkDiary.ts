/**
 * PostgreSQL implementation of LfkDiaryPort.
 * Tables: lfk_sessions (see webapp/migrations/001_diaries.sql).
 */
import { getPool } from "@/infra/db/client";
import type { LfkDiaryPort } from "@/modules/diaries/ports";
import type { LfkSession } from "@/modules/diaries/types";

function rowToSession(row: {
  id: string;
  user_id: string;
  completed_at: Date;
  complex_id: string | null;
  complex_title: string | null;
}): LfkSession {
  return {
    id: String(row.id),
    userId: row.user_id,
    completedAt: row.completed_at.toISOString(),
    complexId: row.complex_id,
    complexTitle: row.complex_title,
  };
}

export const pgLfkDiaryPort: LfkDiaryPort = {
  async addSession(params) {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO lfk_sessions (user_id, completed_at, complex_id, complex_title)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, completed_at, complex_id, complex_title`,
      [
        params.userId,
        new Date(params.completedAt),
        params.complexId ?? null,
        params.complexTitle ?? null,
      ]
    );
    return rowToSession(result.rows[0]);
  },

  async listSessions(userId, limit = 50) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, user_id, completed_at, complex_id, complex_title
       FROM lfk_sessions
       WHERE user_id = $1
       ORDER BY completed_at DESC
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows.map(rowToSession);
  },
};
