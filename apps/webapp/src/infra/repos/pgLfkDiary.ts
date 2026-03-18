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
}): LfkComplex {
  return {
    id: String(row.id),
    userId: row.user_id,
    title: row.title,
    origin: row.origin as "manual" | "assigned_by_specialist",
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
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
}): LfkSession {
  return {
    id: String(row.id),
    userId: row.user_id,
    complexId: row.complex_id,
    completedAt: row.completed_at.toISOString(),
    source: row.source as "bot" | "webapp",
    createdAt: row.created_at.toISOString(),
    ...(row.complex_title != null && { complexTitle: row.complex_title }),
  };
}

export const pgLfkDiaryPort: LfkDiaryPort = {
  async createComplex(params) {
    const pool = getPool();
    const now = new Date();
    const result = await pool.query(
      `INSERT INTO lfk_complexes (user_id, title, origin, is_active, updated_at)
       VALUES ($1, $2, $3, true, $4)
       RETURNING id, user_id, title, origin, is_active, created_at, updated_at`,
      [params.userId, params.title, params.origin ?? "manual", now]
    );
    return rowToComplex(result.rows[0]);
  },

  async listComplexes(userId, activeOnly = true) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, user_id, title, origin, is_active, created_at, updated_at
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
    const result = await pool.query(
      `INSERT INTO lfk_sessions (user_id, complex_id, completed_at, source)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, complex_id, completed_at, source, created_at`,
      [params.userId, params.complexId, completedAt, params.source]
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
      `SELECT s.id, s.user_id, s.complex_id, s.completed_at, s.source, s.created_at, c.title AS complex_title
       FROM lfk_sessions s
       JOIN lfk_complexes c ON c.id = s.complex_id
       WHERE s.user_id = $1
       ORDER BY s.completed_at DESC
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows.map(rowToSession);
  },
};
