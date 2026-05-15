import { getPool } from "@/infra/db/client";
import type { BroadcastAuditEntry, BroadcastAuditPort } from "@/modules/doctor-broadcasts/ports";
import { normalizeBroadcastChannels } from "@/modules/doctor-broadcasts/broadcastChannels";

function mapRow(row: Record<string, unknown>): BroadcastAuditEntry {
  const rawChannels = row.channels;
  const channels = normalizeBroadcastChannels(
    Array.isArray(rawChannels) ? rawChannels.map(String) : undefined,
  );
  return {
    id: String(row.id),
    actorId: String(row.actor_id),
    category: row.category as BroadcastAuditEntry["category"],
    audienceFilter: row.audience_filter as BroadcastAuditEntry["audienceFilter"],
    messageTitle: String(row.message_title),
    messageBody: typeof row.message_body === "string" ? row.message_body : "",
    channels,
    executedAt: new Date(String(row.executed_at)).toISOString(),
    previewOnly: Boolean(row.preview_only),
    audienceSize: Number(row.audience_size),
    deliveryJobsTotal: Number(row.delivery_jobs_total ?? 0),
    attachMenuAfterSend: Boolean(row.attach_menu_after_send ?? false),
    sentCount: Number(row.sent_count),
    errorCount: Number(row.error_count),
  };
}

export function createPgBroadcastAuditPort(): BroadcastAuditPort {
  return {
    async append(entry): Promise<BroadcastAuditEntry> {
      const pool = getPool();
      const r = await pool.query(
        `INSERT INTO broadcast_audit (
           actor_id, category, audience_filter, message_title, message_body, channels,
           preview_only, audience_size, delivery_jobs_total, attach_menu_after_send, sent_count, error_count
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id, actor_id, category, audience_filter, message_title, message_body, channels, executed_at, preview_only, audience_size, delivery_jobs_total, attach_menu_after_send, sent_count, error_count`,
        [
          entry.actorId,
          entry.category,
          entry.audienceFilter,
          entry.messageTitle,
          entry.messageBody ?? "",
          entry.channels,
          entry.previewOnly,
          entry.audienceSize,
          entry.deliveryJobsTotal ?? 0,
          entry.attachMenuAfterSend,
          entry.sentCount,
          entry.errorCount,
        ],
      );
      return mapRow(r.rows[0] as Record<string, unknown>);
    },
    async list(limit = 50): Promise<BroadcastAuditEntry[]> {
      const pool = getPool();
      const r = await pool.query(
        `SELECT id, actor_id, category, audience_filter, message_title, message_body, channels, executed_at, preview_only, audience_size, delivery_jobs_total, attach_menu_after_send, sent_count, error_count
         FROM broadcast_audit ORDER BY executed_at DESC LIMIT $1`,
        [limit],
      );
      return r.rows.map((row) => mapRow(row as Record<string, unknown>));
    },
  };
}
