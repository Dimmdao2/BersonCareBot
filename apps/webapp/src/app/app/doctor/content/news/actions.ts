"use server";

import { revalidatePath } from "next/cache";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { getPool } from "@/infra/db/client";
import { env } from "@/config/env";

export type NewsActionState = { ok: boolean; error?: string };

function revalidateNewsAndMotivation() {
  revalidatePath("/app/doctor/content/news");
  revalidatePath("/app/doctor/content/motivation");
  revalidatePath("/app/patient");
}

export async function upsertNewsItem(_p: NewsActionState | null, formData: FormData): Promise<NewsActionState> {
  await requireDoctorAccess();
  if (!env.DATABASE_URL) return { ok: false, error: "База данных недоступна" };

  const id = (formData.get("id") as string)?.trim();
  const title = (formData.get("title") as string)?.trim() ?? "";
  const bodyMd = (formData.get("body_md") as string) ?? "";
  const isVisible = formData.get("is_visible") === "on";
  const sortOrderRaw = formData.get("sort_order");
  let sortOrder = parseInt(String(sortOrderRaw ?? "0"), 10);
  if (Number.isNaN(sortOrder)) sortOrder = 0;
  if (!title) return { ok: false, error: "Заголовок обязателен" };
  if (bodyMd.length > 20000) return { ok: false, error: "Текст слишком длинный" };

  const pool = getPool();
  try {
    if (id) {
      await pool.query(
        `UPDATE news_items SET title = $2, body_md = $3, is_visible = $4, sort_order = $5,
         published_at = CASE WHEN $4 AND published_at IS NULL THEN now() ELSE published_at END,
         updated_at = now() WHERE id = $1::uuid`,
        [id, title, bodyMd, isVisible, sortOrder]
      );
    } else {
      const nextOrder = await pool.query<{ n: string }>(
        `SELECT (COALESCE(MAX(sort_order), -1) + 1)::text AS n FROM news_items`,
      );
      const insertOrder = Number(nextOrder.rows[0]?.n ?? "0");
      await pool.query(
        `INSERT INTO news_items (title, body_md, is_visible, sort_order, published_at)
         VALUES ($1, $2, $3, $4, CASE WHEN $3 THEN now() ELSE NULL END)`,
        [title, bodyMd, isVisible, insertOrder],
      );
    }
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Не удалось сохранить" };
  }
  revalidateNewsAndMotivation();
  return { ok: true };
}

export async function upsertMotivationQuote(
  _p: NewsActionState | null,
  formData: FormData,
): Promise<NewsActionState> {
  await requireDoctorAccess();
  if (!env.DATABASE_URL) return { ok: false, error: "База данных недоступна" };

  const id = (formData.get("id") as string)?.trim();
  const bodyText = (formData.get("body_text") as string)?.trim() ?? "";
  const author = (formData.get("author") as string)?.trim() || null;
  const isActive = formData.get("is_active") === "on";
  const sortOrderRaw = formData.get("sort_order");
  let sortOrder = parseInt(String(sortOrderRaw ?? "0"), 10);
  if (Number.isNaN(sortOrder)) sortOrder = 0;
  if (!bodyText) return { ok: false, error: "Текст обязателен" };

  const pool = getPool();
  try {
    if (id) {
      await pool.query(
        `UPDATE motivational_quotes SET body_text = $2, author = $3, is_active = $4, sort_order = $5 WHERE id = $1::uuid`,
        [id, bodyText, author, isActive, sortOrder]
      );
    } else {
      const nextOrder = await pool.query<{ n: string }>(
        `SELECT (COALESCE(MAX(sort_order), -1) + 1)::text AS n FROM motivational_quotes`,
      );
      const insertOrder = Number(nextOrder.rows[0]?.n ?? "0");
      await pool.query(
        `INSERT INTO motivational_quotes (body_text, author, is_active, sort_order) VALUES ($1, $2, $3, $4)`,
        [bodyText, author, isActive, insertOrder],
      );
    }
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Не удалось сохранить" };
  }
  revalidateNewsAndMotivation();
  return { ok: true };
}

export async function toggleNewsArchive(formData: FormData): Promise<void> {
  const id = (formData.get("id") as string)?.trim();
  const nextArchived = formData.get("next_archived") === "true";
  if (!id) return;
  await setNewsArchived(id, nextArchived);
}

export async function toggleQuoteArchive(formData: FormData): Promise<void> {
  const id = (formData.get("id") as string)?.trim();
  const nextArchived = formData.get("next_archived") === "true";
  if (!id) return;
  await setQuoteArchived(id, nextArchived);
}

export async function setNewsArchived(id: string, archived: boolean): Promise<NewsActionState> {
  await requireDoctorAccess();
  if (!env.DATABASE_URL) return { ok: false, error: "База данных недоступна" };
  const pool = getPool();
  await pool.query(
    `UPDATE news_items SET archived_at = $2::timestamptz, updated_at = now() WHERE id = $1::uuid`,
    [id, archived ? new Date() : null]
  );
  revalidateNewsAndMotivation();
  return { ok: true };
}

export async function setQuoteArchived(id: string, archived: boolean): Promise<NewsActionState> {
  await requireDoctorAccess();
  if (!env.DATABASE_URL) return { ok: false, error: "База данных недоступна" };
  const pool = getPool();
  await pool.query(`UPDATE motivational_quotes SET archived_at = $2::timestamptz WHERE id = $1::uuid`, [
    id,
    archived ? new Date() : null,
  ]);
  revalidateNewsAndMotivation();
  return { ok: true };
}

export async function setNewsItemVisible(id: string, nextVisible: boolean): Promise<NewsActionState> {
  await requireDoctorAccess();
  if (!env.DATABASE_URL) return { ok: false, error: "База данных недоступна" };
  const pool = getPool();
  try {
    await pool.query(
      `UPDATE news_items SET is_visible = $2,
       published_at = CASE WHEN $2 AND published_at IS NULL THEN now() ELSE published_at END,
       updated_at = now() WHERE id = $1::uuid`,
      [id, nextVisible],
    );
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Не удалось обновить видимость" };
  }
  revalidateNewsAndMotivation();
  return { ok: true };
}

export async function setQuoteActive(id: string, nextActive: boolean): Promise<NewsActionState> {
  await requireDoctorAccess();
  if (!env.DATABASE_URL) return { ok: false, error: "База данных недоступна" };
  const pool = getPool();
  try {
    await pool.query(`UPDATE motivational_quotes SET is_active = $2 WHERE id = $1::uuid`, [id, nextActive]);
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Не удалось обновить активность" };
  }
  revalidateNewsAndMotivation();
  return { ok: true };
}

export type ReorderState = { ok: boolean; error?: string };

export async function reorderNewsItems(orderedIds: string[]): Promise<ReorderState> {
  await requireDoctorAccess();
  if (!env.DATABASE_URL) return { ok: false, error: "База данных недоступна" };
  if (!orderedIds.length) return { ok: false, error: "Пустой порядок" };
  const ids = orderedIds.map((x) => String(x).trim()).filter(Boolean);
  if (ids.length !== orderedIds.length) return { ok: false, error: "Некорректные id" };

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const check = await client.query<{ id: string }>(`SELECT id::text AS id FROM news_items`);
    const inDb = new Set(check.rows.map((r) => r.id));
    if (inDb.size !== ids.length) throw new Error("mismatch");
    for (const id of ids) {
      if (!inDb.has(id)) throw new Error("unknown");
    }
    for (let i = 0; i < ids.length; i++) {
      const sortOrder = ids.length - 1 - i;
      await client.query(
        `UPDATE news_items SET sort_order = $1, updated_at = now() WHERE id = $2::uuid`,
        [sortOrder, ids[i]],
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    console.error(e);
    return { ok: false, error: "Не удалось сохранить порядок" };
  } finally {
    client.release();
  }
  revalidateNewsAndMotivation();
  return { ok: true };
}

export async function reorderMotivationQuotes(orderedIds: string[]): Promise<ReorderState> {
  await requireDoctorAccess();
  if (!env.DATABASE_URL) return { ok: false, error: "База данных недоступна" };
  if (!orderedIds.length) return { ok: false, error: "Пустой порядок" };
  const ids = orderedIds.map((x) => String(x).trim()).filter(Boolean);
  if (ids.length !== orderedIds.length) return { ok: false, error: "Некорректные id" };

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const check = await client.query<{ id: string }>(`SELECT id::text AS id FROM motivational_quotes`);
    const inDb = new Set(check.rows.map((r) => r.id));
    if (inDb.size !== ids.length) throw new Error("mismatch");
    for (const id of ids) {
      if (!inDb.has(id)) throw new Error("unknown");
    }
    for (let i = 0; i < ids.length; i++) {
      await client.query(`UPDATE motivational_quotes SET sort_order = $1 WHERE id = $2::uuid`, [i, ids[i]]);
    }
    await client.query("COMMIT");
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    console.error(e);
    return { ok: false, error: "Не удалось сохранить порядок" };
  } finally {
    client.release();
  }
  revalidateNewsAndMotivation();
  return { ok: true };
}
