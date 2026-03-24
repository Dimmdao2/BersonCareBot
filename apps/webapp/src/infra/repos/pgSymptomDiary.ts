/**
 * PostgreSQL implementation of SymptomDiaryPort.
 * Tables: symptom_trackings, symptom_entries (see webapp/migrations/004_symptom_trackings_and_entries.sql).
 */
import { getPool } from "@/infra/db/client";
import type { SymptomDiaryPort } from "@/modules/diaries/ports";
import type { SymptomEntry, SymptomTracking } from "@/modules/diaries/types";

function rowToTracking(row: {
  id: string;
  user_id: string;
  symptom_key: string | null;
  symptom_title: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  symptom_type_ref_id?: string | null;
  region_ref_id?: string | null;
  side?: string | null;
  diagnosis_text?: string | null;
  diagnosis_ref_id?: string | null;
  stage_ref_id?: string | null;
  deleted_at?: Date | null;
}): SymptomTracking {
  return {
    id: String(row.id),
    userId: row.user_id,
    symptomKey: row.symptom_key,
    symptomTitle: row.symptom_title,
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    symptomTypeRefId: row.symptom_type_ref_id ? String(row.symptom_type_ref_id) : null,
    regionRefId: row.region_ref_id ? String(row.region_ref_id) : null,
    side: (row.side as SymptomTracking["side"]) ?? null,
    diagnosisText: row.diagnosis_text ?? null,
    diagnosisRefId: row.diagnosis_ref_id ? String(row.diagnosis_ref_id) : null,
    stageRefId: row.stage_ref_id ? String(row.stage_ref_id) : null,
    deletedAt: row.deleted_at ? row.deleted_at.toISOString() : null,
  };
}

function rowToEntry(row: {
  id: string;
  user_id: string;
  tracking_id: string;
  value_0_10: number;
  entry_type: string;
  recorded_at: Date;
  source: string;
  notes: string | null;
  created_at: Date;
  symptom_title?: string;
}): SymptomEntry {
  return {
    id: String(row.id),
    userId: row.user_id,
    trackingId: row.tracking_id,
    value0_10: row.value_0_10,
    entryType: row.entry_type as "instant" | "daily",
    recordedAt: row.recorded_at.toISOString(),
    source: row.source as "bot" | "webapp" | "import",
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    ...(row.symptom_title != null && { symptomTitle: row.symptom_title }),
  };
}

const TRACKING_SELECT = `id, user_id, symptom_key, symptom_title, is_active, created_at, updated_at,
    symptom_type_ref_id, region_ref_id, side, diagnosis_text, diagnosis_ref_id, stage_ref_id, deleted_at`;

export const pgSymptomDiaryPort: SymptomDiaryPort = {
  async createTracking(params) {
    const pool = getPool();
    const now = new Date();
    const result = await pool.query(
      `INSERT INTO symptom_trackings (
         user_id, symptom_key, symptom_title, is_active, updated_at,
         symptom_type_ref_id, region_ref_id, side, diagnosis_text, diagnosis_ref_id, stage_ref_id
       )
       VALUES ($1, $2, $3, true, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${TRACKING_SELECT}`,
      [
        params.userId,
        params.symptomKey ?? null,
        params.symptomTitle,
        now,
        params.symptomTypeRefId ?? null,
        params.regionRefId ?? null,
        params.side ?? null,
        params.diagnosisText ?? null,
        params.diagnosisRefId ?? null,
        params.stageRefId ?? null,
      ]
    );
    return rowToTracking(result.rows[0]);
  },

  async listTrackings(userId, activeOnly = true) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT ${TRACKING_SELECT}
       FROM symptom_trackings
       WHERE user_id = $1 AND deleted_at IS NULL
       ${activeOnly ? "AND is_active = true" : ""}
       ORDER BY updated_at DESC`,
      [userId]
    );
    return result.rows.map(rowToTracking);
  },

  async addEntry(params) {
    const pool = getPool();
    const recordedAt = new Date(params.recordedAt);
    const result = await pool.query(
      `INSERT INTO symptom_entries (user_id, tracking_id, value_0_10, entry_type, recorded_at, source, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, user_id, tracking_id, value_0_10, entry_type, recorded_at, source, notes, created_at`,
      [
        params.userId,
        params.trackingId,
        params.value0_10,
        params.entryType,
        recordedAt,
        params.source,
        params.notes ?? null,
      ]
    );
    const row = result.rows[0];
    const tracking = await pool.query(
      `SELECT symptom_title FROM symptom_trackings WHERE id = $1`,
      [params.trackingId]
    );
    return rowToEntry({
      ...row,
      symptom_title: tracking.rows[0]?.symptom_title,
    });
  },

  async listEntries(userId, limit = 50) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT e.id, e.user_id, e.tracking_id, e.value_0_10, e.entry_type, e.recorded_at, e.source, e.notes, e.created_at,
              t.symptom_title
       FROM symptom_entries e
       JOIN symptom_trackings t ON t.id = e.tracking_id
       WHERE e.user_id = $1 AND t.deleted_at IS NULL
       ORDER BY e.recorded_at DESC
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows.map(rowToEntry);
  },

  async getTrackingForUser(params) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT ${TRACKING_SELECT}
       FROM symptom_trackings
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [params.trackingId, params.userId]
    );
    return result.rows[0] ? rowToTracking(result.rows[0]) : null;
  },

  async listEntriesForTrackingInRange(params) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT e.id, e.user_id, e.tracking_id, e.value_0_10, e.entry_type, e.recorded_at, e.source, e.notes, e.created_at,
              t.symptom_title
       FROM symptom_entries e
       JOIN symptom_trackings t ON t.id = e.tracking_id
       WHERE e.user_id = $1 AND e.tracking_id = $2
         AND e.recorded_at >= $3::timestamptz AND e.recorded_at < $4::timestamptz
         AND t.deleted_at IS NULL
       ORDER BY e.recorded_at ASC`,
      [params.userId, params.trackingId, params.fromRecordedAt, params.toRecordedAtExclusive]
    );
    return result.rows.map(rowToEntry);
  },

  async updateTrackingTitle(params) {
    const pool = getPool();
    await pool.query(
      `UPDATE symptom_trackings SET symptom_title = $3, updated_at = now()
       WHERE id = $2 AND user_id = $1 AND deleted_at IS NULL`,
      [params.userId, params.trackingId, params.symptomTitle]
    );
  },

  async setTrackingActive(params) {
    const pool = getPool();
    await pool.query(
      `UPDATE symptom_trackings SET is_active = $3, updated_at = now()
       WHERE id = $2 AND user_id = $1 AND deleted_at IS NULL`,
      [params.userId, params.trackingId, params.isActive]
    );
  },

  async softDeleteTracking(params) {
    const pool = getPool();
    await pool.query(
      `UPDATE symptom_trackings SET is_active = false, deleted_at = now(), updated_at = now()
       WHERE id = $2 AND user_id = $1 AND deleted_at IS NULL`,
      [params.userId, params.trackingId]
    );
  },
};
