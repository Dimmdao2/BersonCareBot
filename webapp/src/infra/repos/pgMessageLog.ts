import { getPool } from "@/infra/db/client";
import type { MessageLogEntry, MessageLogPort } from "@/modules/doctor-messaging/ports";

export function createPgMessageLogPort(): MessageLogPort {
  return {
    async append(entry): Promise<MessageLogEntry> {
      const pool = getPool();
      const r = await pool.query(
        `INSERT INTO message_log (user_id, sender_id, text, category, channel_bindings_used, outcome, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, user_id, sender_id, text, category, channel_bindings_used, sent_at, outcome, error_message`,
        [
          entry.userId,
          entry.senderId,
          entry.text,
          entry.category,
          JSON.stringify(entry.channelBindingsUsed ?? {}),
          entry.outcome,
          entry.errorMessage ?? null,
        ]
      );
      const row = r.rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        senderId: row.sender_id,
        text: row.text,
        category: row.category,
        channelBindingsUsed: (row.channel_bindings_used as Record<string, string>) ?? {},
        sentAt: new Date(row.sent_at).toISOString(),
        outcome: row.outcome,
        errorMessage: row.error_message,
      };
    },
    async listByUser(userId: string, limit = 50): Promise<MessageLogEntry[]> {
      const pool = getPool();
      const r = await pool.query(
        `SELECT id, user_id, sender_id, text, category, channel_bindings_used, sent_at, outcome, error_message
         FROM message_log WHERE user_id = $1 ORDER BY sent_at DESC LIMIT $2`,
        [userId, limit]
      );
      return r.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        senderId: row.sender_id,
        text: row.text,
        category: row.category,
        channelBindingsUsed: (row.channel_bindings_used as Record<string, string>) ?? {},
        sentAt: new Date(row.sent_at).toISOString(),
        outcome: row.outcome,
        errorMessage: row.error_message,
      }));
    },
  };
}
