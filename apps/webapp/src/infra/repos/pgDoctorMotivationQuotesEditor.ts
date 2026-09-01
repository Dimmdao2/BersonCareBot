import { asc, sql } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { getPool } from '@/infra/db/client';
import {
  getWebappSqlFromPgClient,
  runWebappSql,
  runWebappTransaction,
} from '@/infra/db/runWebappSql';
import { withPoolTransaction } from '@/infra/db/withClient';
import type { DoctorMotivationQuotesEditorPort } from '@/modules/doctor-motivation-quotes/ports';
import { motivationalQuotes } from '../../../db/schema';

export function createPgDoctorMotivationQuotesEditorPort(): DoctorMotivationQuotesEditorPort {
  return {
    async listQuotesForEditor() {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(motivationalQuotes)
        .orderBy(asc(motivationalQuotes.sortOrder), asc(motivationalQuotes.createdAt));
      return rows.map((r) => ({
        id: r.id,
        body_text: r.bodyText,
        author: r.author,
        is_active: r.isActive,
        sort_order: r.sortOrder,
        archived_at: r.archivedAt ? new Date(r.archivedAt) : null,
      }));
    },

    async upsertQuote(params) {
      await runWebappTransaction(async (tx) => {
        if (params.id) {
          const sortOrder = params.sortOrder ?? 0;
          await runWebappSql(
            tx,
            sql`UPDATE motivational_quotes SET body_text = ${params.bodyText}, author = ${params.author}, is_active = ${params.isActive}, sort_order = ${sortOrder} WHERE id = ${params.id}::uuid`,
          );
          return;
        }
        const nextOrder = await runWebappSql<{ n: string }>(
          tx,
          sql`SELECT (COALESCE(MAX(sort_order), -1) + 1)::text AS n FROM motivational_quotes`,
        );
        const insertOrder = Number(nextOrder.rows[0]?.n ?? '0');
        await runWebappSql(
          tx,
          sql`INSERT INTO motivational_quotes (body_text, author, is_active, sort_order) VALUES (${params.bodyText}, ${params.author}, ${params.isActive}, ${insertOrder})`,
        );
      });
    },

    async setQuoteArchived(id, archived) {
      await runWebappTransaction((tx) =>
        runWebappSql(
          tx,
          sql`UPDATE motivational_quotes SET archived_at = ${archived ? new Date() : null}::timestamptz WHERE id = ${id}::uuid`,
        ),
      );
    },

    async setQuoteActive(id, nextActive) {
      await runWebappTransaction((tx) =>
        runWebappSql(
          tx,
          sql`UPDATE motivational_quotes SET is_active = ${nextActive} WHERE id = ${id}::uuid`,
        ),
      );
    },

    async reorderQuotes(orderedIds) {
      const pool = getPool();
      await withPoolTransaction(pool, async (client) => {
        const check = await runWebappSql<{ id: string }>(
          getWebappSqlFromPgClient(client),
          sql`SELECT id::text AS id FROM motivational_quotes`,
        );
        const inDb = new Set(check.rows.map((r) => r.id));
        if (inDb.size !== orderedIds.length) throw new Error('mismatch');
        for (const id of orderedIds) {
          if (!inDb.has(id)) throw new Error('unknown');
        }
        for (let i = 0; i < orderedIds.length; i++) {
          await runWebappSql(
            getWebappSqlFromPgClient(client),
            sql`UPDATE motivational_quotes SET sort_order = ${i} WHERE id = ${orderedIds[i]}::uuid`,
          );
        }
      });
    },
  };
}
