import { sql, type SQL } from 'drizzle-orm';
/**
 * Domain SQL as typed Drizzle fragments (dynamic filters composed in `buildWhere`).
 */
import { getWebappSqlDb, runWebappSql } from '@/infra/db/runWebappSql';
import { platformUserMatchSql } from '@/infra/repos/platformUserMatchSql';
import { toIsoStringSafe } from '@/shared/lib/toIsoStringSafe';
import type {
  MessageLogEntry,
  MessageLogListFilters,
  MessageLogListResult,
  MessageLogPort,
} from '@/modules/doctor-messaging/ports';

function normalizePage(
  page?: number,
  pageSize?: number,
): { page: number; pageSize: number; offset: number } {
  const normalizedPage = Math.max(1, Math.floor(page ?? 1));
  const normalizedPageSize = Math.min(100, Math.max(1, Math.floor(pageSize ?? 20)));
  return {
    page: normalizedPage,
    pageSize: normalizedPageSize,
    offset: (normalizedPage - 1) * normalizedPageSize,
  };
}

function buildWhere(filters?: MessageLogListFilters): SQL {
  const where: SQL[] = [];
  if (filters?.userId) {
    where.push(platformUserMatchSql(null, filters.userId));
  }
  if (filters?.category) {
    where.push(sql`category = ${filters.category}`);
  }
  if (filters?.dateFrom) {
    where.push(sql`sent_at >= ${filters.dateFrom}::timestamptz`);
  }
  if (filters?.dateTo) {
    where.push(sql`sent_at <= ${filters.dateTo}::timestamptz`);
  }
  return where.length > 0 ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``;
}

function mapRows(rows: MessageLogRow[]): MessageLogEntry[] {
  return rows.map((row) => ({
    id: String(row.id),
    userId:
      row.platform_user_id != null && String(row.platform_user_id).trim() !== ''
        ? String(row.platform_user_id)
        : String(row.user_id),
    senderId: String(row.sender_id),
    text: String(row.text),
    category: String(row.category),
    channelBindingsUsed: (row.channel_bindings_used as Record<string, string>) ?? {},
    sentAt: new Date(String(row.sent_at)).toISOString(),
    outcome: row.outcome as MessageLogEntry['outcome'],
    errorMessage: (row.error_message as string | null) ?? null,
  }));
}

type MessageLogRow = {
  id: string;
  user_id: string;
  platform_user_id: string | null;
  sender_id: string;
  text: string;
  category: string;
  channel_bindings_used: Record<string, string> | null;
  sent_at: Date | string;
  outcome: MessageLogEntry['outcome'];
  error_message: string | null;
};

export function createPgMessageLogPort(): MessageLogPort {
  return {
    async append(entry): Promise<MessageLogEntry> {
      const r = await runWebappSql<{
        id: string;
        user_id: string;
        platform_user_id: string | null;
        sender_id: string;
        text: string;
        category: string;
        channel_bindings_used: Record<string, string>;
        sent_at: Date;
        outcome: MessageLogEntry['outcome'];
        error_message: string | null;
      }>(
        getWebappSqlDb(),
        sql`INSERT INTO message_log (
           user_id, platform_user_id, sender_id, text, category, channel_bindings_used, outcome, error_message
         )
         VALUES (${entry.userId}::text, ${entry.userId}::uuid, ${entry.senderId}, ${entry.text}, ${entry.category}, ${JSON.stringify(entry.channelBindingsUsed ?? {})}, ${entry.outcome}, ${entry.errorMessage ?? null})
         RETURNING id, user_id, platform_user_id, sender_id, text, category, channel_bindings_used, sent_at, outcome, error_message`,
      );
      const row = r.rows[0]!;
      return {
        id: row.id,
        userId: row.platform_user_id ?? row.user_id,
        senderId: row.sender_id,
        text: row.text,
        category: row.category,
        channelBindingsUsed: row.channel_bindings_used ?? {},
        sentAt: new Date(row.sent_at).toISOString(),
        outcome: row.outcome,
        errorMessage: row.error_message,
      };
    },
    async listByUser(userId: string, params): Promise<MessageLogListResult> {
      const paging = normalizePage(params?.page, params?.pageSize);
      const where = buildWhere({ userId });
      const db = getWebappSqlDb();
      const [listRes, countRes] = await Promise.all([
        runWebappSql<MessageLogRow>(
          db,
          sql`SELECT id, user_id, platform_user_id, sender_id, text, category, channel_bindings_used, sent_at, outcome, error_message
           FROM message_log
           ${where}
           ORDER BY sent_at DESC
           LIMIT ${paging.pageSize}
           OFFSET ${paging.offset}`,
        ),
        runWebappSql<{ c: string }>(db, sql`SELECT COUNT(*)::text AS c FROM message_log ${where}`),
      ]);
      return {
        items: mapRows(listRes.rows),
        total: parseInt(countRes.rows[0]?.c ?? '0', 10),
        page: paging.page,
        pageSize: paging.pageSize,
      };
    },
    async listAll(params): Promise<MessageLogListResult> {
      const paging = normalizePage(params?.page, params?.pageSize);
      const where = buildWhere(params?.filters);
      const db = getWebappSqlDb();
      const [listRes, countRes] = await Promise.all([
        runWebappSql<MessageLogRow>(
          db,
          sql`SELECT id, user_id, platform_user_id, sender_id, text, category, channel_bindings_used, sent_at, outcome, error_message
           FROM message_log
           ${where}
           ORDER BY sent_at DESC
           LIMIT ${paging.pageSize}
           OFFSET ${paging.offset}`,
        ),
        runWebappSql<{ c: string }>(db, sql`SELECT COUNT(*)::text AS c FROM message_log ${where}`),
      ]);
      return {
        items: mapRows(listRes.rows),
        total: parseInt(countRes.rows[0]?.c ?? '0', 10),
        page: paging.page,
        pageSize: paging.pageSize,
      };
    },
  };
}
