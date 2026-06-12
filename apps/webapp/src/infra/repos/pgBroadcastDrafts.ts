import { getPool } from "@/infra/db/client";
import type { BroadcastDraftPort, BroadcastDraft } from "@/modules/doctor-broadcasts/draftPort";

export function createPgBroadcastDraftPort(): BroadcastDraftPort {
  const pool = getPool();

  return {
    async loadDraft(doctorUserId: string): Promise<BroadcastDraft | null> {
      const { rows } = await pool.query<{
        category: string | null;
        audience: string | null;
        channels: string[];
        title: string;
        body: string;
      }>(
        `SELECT category, audience, channels, title, body
         FROM broadcast_drafts
         WHERE doctor_user_id = $1`,
        [doctorUserId],
      );
      if (!rows[0]) return null;
      const row = rows[0];
      return {
        category: (row.category ?? null) as BroadcastDraft["category"],
        audience: (row.audience ?? null) as BroadcastDraft["audience"],
        channels: (row.channels ?? []) as BroadcastDraft["channels"],
        title: row.title ?? "",
        body: row.body ?? "",
      };
    },

    async saveDraft(doctorUserId: string, draft: BroadcastDraft): Promise<void> {
      await pool.query(
        `INSERT INTO broadcast_drafts (doctor_user_id, category, audience, channels, title, body, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, NOW())
         ON CONFLICT (doctor_user_id)
         DO UPDATE SET
           category   = EXCLUDED.category,
           audience   = EXCLUDED.audience,
           channels   = EXCLUDED.channels,
           title      = EXCLUDED.title,
           body       = EXCLUDED.body,
           updated_at = NOW()`,
        [
          doctorUserId,
          draft.category ?? null,
          draft.audience ?? null,
          JSON.stringify(draft.channels),
          draft.title,
          draft.body,
        ],
      );
    },
  };
}
