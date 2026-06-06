import { asc } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { getPool } from "@/infra/db/client";
import { getWebappSqlFromPgClient, runWebappPgText } from "@/infra/db/runWebappSql";
import type { DoctorMotivationQuotesEditorPort } from "@/modules/doctor-motivation-quotes/ports";
import { motivationalQuotes } from "../../../db/schema";

/** Wave 3 phase 13D — list via Drizzle; writes via `runWebappPgText`. */
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
      if (params.id) {
        const sortOrder = params.sortOrder ?? 0;
        await runWebappPgText(
          `UPDATE motivational_quotes SET body_text = $2, author = $3, is_active = $4, sort_order = $5 WHERE id = $1::uuid`,
          [params.id, params.bodyText, params.author, params.isActive, sortOrder],
        );
        return;
      }
      const nextOrder = await runWebappPgText<{ n: string }>(
        `SELECT (COALESCE(MAX(sort_order), -1) + 1)::text AS n FROM motivational_quotes`,
      );
      const insertOrder = Number(nextOrder.rows[0]?.n ?? "0");
      await runWebappPgText(
        `INSERT INTO motivational_quotes (body_text, author, is_active, sort_order) VALUES ($1, $2, $3, $4)`,
        [params.bodyText, params.author, params.isActive, insertOrder],
      );
    },

    async setQuoteArchived(id, archived) {
      await runWebappPgText(
        `UPDATE motivational_quotes SET archived_at = $2::timestamptz WHERE id = $1::uuid`,
        [id, archived ? new Date() : null],
      );
    },

    async setQuoteActive(id, nextActive) {
      await runWebappPgText(
        `UPDATE motivational_quotes SET is_active = $2 WHERE id = $1::uuid`,
        [id, nextActive],
      );
    },

    async reorderQuotes(orderedIds) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const check = await runWebappPgText<{ id: string }>(
          `SELECT id::text AS id FROM motivational_quotes`,
          [],
          getWebappSqlFromPgClient(client),
        );
        const inDb = new Set(check.rows.map((r) => r.id));
        if (inDb.size !== orderedIds.length) throw new Error("mismatch");
        for (const id of orderedIds) {
          if (!inDb.has(id)) throw new Error("unknown");
        }
        for (let i = 0; i < orderedIds.length; i++) {
          await runWebappPgText(
            `UPDATE motivational_quotes SET sort_order = $1 WHERE id = $2::uuid`,
            [i, orderedIds[i]],
            getWebappSqlFromPgClient(client),
          );
        }
        await client.query("COMMIT");
      } catch (e) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw e;
      } finally {
        client.release();
      }
    },
  };
}
