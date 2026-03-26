import { createHash } from "node:crypto";
import { getPool } from "@/infra/db/client";
import { env } from "@/config/env";

export type HomeNews = {
  id: string;
  title: string;
  bodyMd: string;
};

export type HomeQuote = {
  id: string;
  body: string;
  author: string | null;
};

/** Одна видимая новость для главной (приоритет sort_order, затем published_at). */
export async function getHomeNews(): Promise<HomeNews | null> {
  if (!env.DATABASE_URL) return null;
  try {
    const pool = getPool();
    const r = await pool.query<{ id: string; title: string; body_md: string }>(
      `SELECT id, title, body_md FROM news_items
       WHERE is_visible = true AND archived_at IS NULL
       ORDER BY sort_order DESC, COALESCE(published_at, created_at) DESC
       LIMIT 1`
    );
    const row = r.rows[0];
    if (!row) return null;
    return { id: row.id, title: row.title, bodyMd: row.body_md ?? "" };
  } catch {
    return null;
  }
}

export async function incrementNewsViews(newsId: string, userId: string): Promise<void> {
  if (!env.DATABASE_URL) return;
  try {
    const pool = getPool();
    const insert = await pool.query(
      `INSERT INTO news_item_views (news_id, user_id, viewed_at)
       VALUES ($1::uuid, $2, now())
       ON CONFLICT (news_id, user_id) DO NOTHING`,
      [newsId, userId]
    );
    if ((insert.rowCount ?? 0) > 0) {
      await pool.query(
        `UPDATE news_items SET views_count = views_count + 1, updated_at = now() WHERE id = $1::uuid`,
        [newsId]
      );
    }
  } catch {
    /* ignore */
  }
}

/** Ключ календарного дня UTC для выбора цитаты (тестируемая детерминированность). */
export function quoteDayKeyUtc(referenceDate: Date): string {
  return referenceDate.toISOString().slice(0, 10);
}

/** Индекс цитаты для пары (seed, день); совпадает с логикой `getQuoteForDay`. */
export function quoteIndexForDaySeed(daySeed: string, dayKey: string, total: number): number {
  if (total <= 0) return 0;
  const h = createHash("sha256").update(`${daySeed}:${dayKey}`).digest();
  return h.readUInt32BE(0) % total;
}

/** Детерминированная «цитата дня» из активных записей (стабильна в пределах суток UTC). */
export async function getQuoteForDay(
  daySeed: string,
  referenceDate: Date = new Date()
): Promise<HomeQuote | null> {
  if (!env.DATABASE_URL) return null;
  try {
    const pool = getPool();
    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM motivational_quotes
       WHERE is_active = true AND archived_at IS NULL`
    );
    const total = parseInt(countResult.rows[0]?.count ?? "0", 10);
    if (total <= 0) return null;

    const dayKey = quoteDayKeyUtc(referenceDate);
    const idx = quoteIndexForDaySeed(daySeed, dayKey, total);

    const rowResult = await pool.query<{ id: string; body_text: string; author: string | null }>(
      `SELECT id, body_text, author
       FROM motivational_quotes
       WHERE is_active = true AND archived_at IS NULL
       ORDER BY sort_order ASC, id ASC
       LIMIT 1 OFFSET $1`,
      [idx]
    );
    const row = rowResult.rows[0];
    if (!row) return null;
    return { id: row.id, body: row.body_text, author: row.author };
  } catch {
    return null;
  }
}
