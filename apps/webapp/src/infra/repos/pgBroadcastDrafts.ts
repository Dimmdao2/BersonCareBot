/**
 * Broadcast draft persistence — one draft per doctor, last-write-wins.
 * Wave 3 phase 15G — migrated from pool.query to Drizzle db.execute(sql).
 */
import { sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import type { BroadcastDraftPort, BroadcastDraft } from "@/modules/doctor-broadcasts/draftPort";

type RawDraftRow = {
  category: string | null;
  audience: string | null;
  channels: string[];
  title: string;
  body: string;
};

export function createPgBroadcastDraftPort(): BroadcastDraftPort {
  return {
    async loadDraft(doctorUserId: string): Promise<BroadcastDraft | null> {
      const db = getDrizzle();
      const result = await db.execute<RawDraftRow>(sql`
        SELECT category, audience, channels, title, body
        FROM broadcast_drafts
        WHERE doctor_user_id = ${doctorUserId}
      `);
      const row = result.rows[0] as RawDraftRow | undefined;
      if (!row) return null;
      return {
        category: (row.category ?? null) as BroadcastDraft["category"],
        audience: (row.audience ?? null) as BroadcastDraft["audience"],
        channels: (row.channels ?? []) as BroadcastDraft["channels"],
        title: row.title ?? "",
        body: row.body ?? "",
      };
    },

    async saveDraft(doctorUserId: string, draft: BroadcastDraft): Promise<void> {
      const db = getDrizzle();
      await db.execute(sql`
        INSERT INTO broadcast_drafts
          (doctor_user_id, category, audience, channels, title, body, updated_at)
        VALUES (
          ${doctorUserId},
          ${draft.category ?? null},
          ${draft.audience ?? null},
          ${JSON.stringify(draft.channels)}::jsonb,
          ${draft.title},
          ${draft.body},
          NOW()
        )
        ON CONFLICT (doctor_user_id)
        DO UPDATE SET
          category   = EXCLUDED.category,
          audience   = EXCLUDED.audience,
          channels   = EXCLUDED.channels,
          title      = EXCLUDED.title,
          body       = EXCLUDED.body,
          updated_at = NOW()
      `);
    },
  };
}
