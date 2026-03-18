import { getPool } from "@/infra/db/client";
import type { BroadcastAuditEntry, BroadcastAuditPort } from "@/modules/doctor-broadcasts/ports";

export function createPgBroadcastAuditPort(): BroadcastAuditPort {
  return {
    async append(entry): Promise<BroadcastAuditEntry> {
      const pool = getPool();
      const r = await pool.query(
        `INSERT INTO broadcast_audit (actor_id, category, audience_filter, message_title, preview_only, audience_size, sent_count, error_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, actor_id, category, audience_filter, message_title, executed_at, preview_only, audience_size, sent_count, error_count`,
        [
          entry.actorId,
          entry.category,
          entry.audienceFilter,
          entry.messageTitle,
          entry.previewOnly,
          entry.audienceSize,
          entry.sentCount,
          entry.errorCount,
        ]
      );
      const row = r.rows[0];
      return {
        id: row.id,
        actorId: row.actor_id,
        category: row.category,
        audienceFilter: row.audience_filter,
        messageTitle: row.message_title,
        executedAt: new Date(row.executed_at).toISOString(),
        previewOnly: row.preview_only,
        audienceSize: row.audience_size,
        sentCount: row.sent_count,
        errorCount: row.error_count,
      };
    },
    async list(limit = 50): Promise<BroadcastAuditEntry[]> {
      const pool = getPool();
      const r = await pool.query(
        `SELECT id, actor_id, category, audience_filter, message_title, executed_at, preview_only, audience_size, sent_count, error_count
         FROM broadcast_audit ORDER BY executed_at DESC LIMIT $1`,
        [limit]
      );
      return r.rows.map((row) => ({
        id: row.id,
        actorId: row.actor_id,
        category: row.category,
        audienceFilter: row.audience_filter,
        messageTitle: row.message_title,
        executedAt: new Date(row.executed_at).toISOString(),
        previewOnly: row.preview_only,
        audienceSize: row.audience_size,
        sentCount: row.sent_count,
        errorCount: row.error_count,
      }));
    },
  };
}
