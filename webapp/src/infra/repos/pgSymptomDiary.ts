/**
 * PostgreSQL implementation of SymptomDiaryPort.
 * Tables: symptom_entries (see webapp/migrations/001_diaries.sql).
 */
import { getPool } from "@/infra/db/client";
import type { SymptomDiaryPort } from "@/modules/diaries/ports";
import type { SymptomEntry } from "@/modules/diaries/types";

function rowToEntry(row: {
  id: string;
  user_id: string;
  symptom: string;
  severity: number;
  notes: string | null;
  recorded_at: Date;
}): SymptomEntry {
  return {
    id: String(row.id),
    userId: row.user_id,
    symptom: row.symptom,
    severity: row.severity as 1 | 2 | 3 | 4 | 5,
    notes: row.notes,
    recordedAt: row.recorded_at.toISOString(),
  };
}

export const pgSymptomDiaryPort: SymptomDiaryPort = {
  async addEntry(params) {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO symptom_entries (user_id, symptom, severity, notes, recorded_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, symptom, severity, notes, recorded_at`,
      [
        params.userId,
        params.symptom,
        params.severity,
        params.notes ?? null,
        new Date(),
      ]
    );
    return rowToEntry(result.rows[0]);
  },

  async listEntries(userId, limit = 50) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, user_id, symptom, severity, notes, recorded_at
       FROM symptom_entries
       WHERE user_id = $1
       ORDER BY recorded_at DESC
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows.map(rowToEntry);
  },
};
