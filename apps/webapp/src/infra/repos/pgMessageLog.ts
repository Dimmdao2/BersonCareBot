import { getPool } from "@/infra/db/client";
import type { MessageLogEntry, MessageLogListFilters, MessageLogListResult, MessageLogPort } from "@/modules/doctor-messaging/ports";

function normalizePage(page?: number, pageSize?: number): { page: number; pageSize: number; offset: number } {
  const normalizedPage = Math.max(1, Math.floor(page ?? 1));
  const normalizedPageSize = Math.min(100, Math.max(1, Math.floor(pageSize ?? 20)));
  return {
    page: normalizedPage,
    pageSize: normalizedPageSize,
    offset: (normalizedPage - 1) * normalizedPageSize,
  };
}

function buildWhere(filters?: MessageLogListFilters): { whereSql: string; values: unknown[] } {
  const where: string[] = [];
  const values: unknown[] = [];
  if (filters?.userId) {
    values.push(filters.userId);
    where.push(`(platform_user_id = $${values.length}::uuid OR (platform_user_id IS NULL AND user_id = $${values.length}::text))`);
  }
  if (filters?.category) {
    values.push(filters.category);
    where.push(`category = $${values.length}`);
  }
  if (filters?.dateFrom) {
    values.push(filters.dateFrom);
    where.push(`sent_at >= $${values.length}::timestamptz`);
  }
  if (filters?.dateTo) {
    values.push(filters.dateTo);
    where.push(`sent_at <= $${values.length}::timestamptz`);
  }
  return {
    whereSql: where.length > 0 ? `WHERE ${where.join(" AND ")}` : "",
    values,
  };
}

function mapRows(rows: Array<Record<string, unknown>>): MessageLogEntry[] {
  return rows.map((row) => ({
    id: String(row.id),
    userId:
      row.platform_user_id != null && String(row.platform_user_id).trim() !== ""
        ? String(row.platform_user_id)
        : String(row.user_id),
    senderId: String(row.sender_id),
    text: String(row.text),
    category: String(row.category),
    channelBindingsUsed: (row.channel_bindings_used as Record<string, string>) ?? {},
    sentAt: new Date(String(row.sent_at)).toISOString(),
    outcome: row.outcome as MessageLogEntry["outcome"],
    errorMessage: (row.error_message as string | null) ?? null,
  }));
}

export function createPgMessageLogPort(): MessageLogPort {
  return {
    async append(entry): Promise<MessageLogEntry> {
      const pool = getPool();
      const r = await pool.query(
        `INSERT INTO message_log (
           user_id, platform_user_id, sender_id, text, category, channel_bindings_used, outcome, error_message
         )
         VALUES ($1::text, $1::uuid, $2, $3, $4, $5, $6, $7)
         RETURNING id, user_id, platform_user_id, sender_id, text, category, channel_bindings_used, sent_at, outcome, error_message`,
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
        userId: row.platform_user_id ?? row.user_id,
        senderId: row.sender_id,
        text: row.text,
        category: row.category,
        channelBindingsUsed: (row.channel_bindings_used as Record<string, string>) ?? {},
        sentAt: new Date(row.sent_at).toISOString(),
        outcome: row.outcome,
        errorMessage: row.error_message,
      };
    },
    async listByUser(userId: string, params): Promise<MessageLogListResult> {
      const paging = normalizePage(params?.page, params?.pageSize);
      const pool = getPool();
      const where = buildWhere({ userId });
      const [listRes, countRes] = await Promise.all([
        pool.query(
          `SELECT id, user_id, platform_user_id, sender_id, text, category, channel_bindings_used, sent_at, outcome, error_message
           FROM message_log
           ${where.whereSql}
           ORDER BY sent_at DESC
           LIMIT $${where.values.length + 1}
           OFFSET $${where.values.length + 2}`,
          [...where.values, paging.pageSize, paging.offset],
        ),
        pool.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM message_log ${where.whereSql}`, where.values),
      ]);
      return {
        items: mapRows(listRes.rows),
        total: parseInt(countRes.rows[0]?.c ?? "0", 10),
        page: paging.page,
        pageSize: paging.pageSize,
      };
    },
    async listAll(params): Promise<MessageLogListResult> {
      const paging = normalizePage(params?.page, params?.pageSize);
      const pool = getPool();
      const where = buildWhere(params?.filters);
      const [listRes, countRes] = await Promise.all([
        pool.query(
          `SELECT id, user_id, platform_user_id, sender_id, text, category, channel_bindings_used, sent_at, outcome, error_message
           FROM message_log
           ${where.whereSql}
           ORDER BY sent_at DESC
           LIMIT $${where.values.length + 1}
           OFFSET $${where.values.length + 2}`,
          [...where.values, paging.pageSize, paging.offset],
        ),
        pool.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM message_log ${where.whereSql}`, where.values),
      ]);
      return {
        items: mapRows(listRes.rows),
        total: parseInt(countRes.rows[0]?.c ?? "0", 10),
        page: paging.page,
        pageSize: paging.pageSize,
      };
    },
  };
}
