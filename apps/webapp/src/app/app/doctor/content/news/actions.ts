"use server";

import { revalidatePath } from "next/cache";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { getPool } from "@/infra/db/client";
import { env } from "@/config/env";

export type NewsActionState = { ok: boolean; error?: string };

export async function upsertNewsItem(_p: NewsActionState | null, formData: FormData): Promise<NewsActionState> {
  await requireDoctorAccess();
  if (!env.DATABASE_URL) return { ok: false, error: "База данных недоступна" };

  const id = (formData.get("id") as string)?.trim();
  const title = (formData.get("title") as string)?.trim() ?? "";
  const bodyMd = (formData.get("body_md") as string) ?? "";
  const isVisible = formData.get("is_visible") === "on";
  const sortOrder = parseInt(String(formData.get("sort_order") ?? "0"), 10) || 0;
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
      await pool.query(
        `INSERT INTO news_items (title, body_md, is_visible, sort_order, published_at)
         VALUES ($1, $2, $3, $4, CASE WHEN $3 THEN now() ELSE NULL END)`,
        [title, bodyMd, isVisible, sortOrder]
      );
    }
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Не удалось сохранить" };
  }
  revalidatePath("/app/doctor/content/news");
  revalidatePath("/app/patient");
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
  const sortOrder = parseInt(String(formData.get("sort_order") ?? "0"), 10) || 0;
  if (!bodyText) return { ok: false, error: "Текст обязателен" };

  const pool = getPool();
  try {
    if (id) {
      await pool.query(
        `UPDATE motivational_quotes SET body_text = $2, author = $3, is_active = $4, sort_order = $5 WHERE id = $1::uuid`,
        [id, bodyText, author, isActive, sortOrder]
      );
    } else {
      await pool.query(
        `INSERT INTO motivational_quotes (body_text, author, is_active, sort_order) VALUES ($1, $2, $3, $4)`,
        [bodyText, author, isActive, sortOrder]
      );
    }
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Не удалось сохранить" };
  }
  revalidatePath("/app/doctor/content/news");
  revalidatePath("/app/patient");
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
  revalidatePath("/app/doctor/content/news");
  revalidatePath("/app/patient");
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
  revalidatePath("/app/doctor/content/news");
  revalidatePath("/app/patient");
  return { ok: true };
}
