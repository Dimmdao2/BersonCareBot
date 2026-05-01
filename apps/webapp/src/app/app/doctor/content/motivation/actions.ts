"use server";

import { revalidatePath } from "next/cache";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { getPool } from "@/infra/db/client";
import { env } from "@/config/env";

export type MotivationActionState = { ok: boolean; error?: string };

function revalidateMotivationAndPatientHome() {
  revalidatePath("/app/doctor/content/motivation");
  revalidatePath("/app/patient");
}

export async function upsertMotivationQuote(
  _p: MotivationActionState | null,
  formData: FormData,
): Promise<MotivationActionState> {
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
        [id, bodyText, author, isActive, sortOrder],
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
  revalidateMotivationAndPatientHome();
  return { ok: true };
}

export async function toggleQuoteArchive(formData: FormData): Promise<void> {
  const id = (formData.get("id") as string)?.trim();
  const nextArchived = formData.get("next_archived") === "true";
  if (!id) return;
  await setQuoteArchived(id, nextArchived);
}

export async function setQuoteArchived(id: string, archived: boolean): Promise<MotivationActionState> {
  await requireDoctorAccess();
  if (!env.DATABASE_URL) return { ok: false, error: "База данных недоступна" };
  const pool = getPool();
  await pool.query(`UPDATE motivational_quotes SET archived_at = $2::timestamptz WHERE id = $1::uuid`, [
    id,
    archived ? new Date() : null,
  ]);
  revalidateMotivationAndPatientHome();
  return { ok: true };
}

export async function setQuoteActive(id: string, nextActive: boolean): Promise<MotivationActionState> {
  await requireDoctorAccess();
  if (!env.DATABASE_URL) return { ok: false, error: "База данных недоступна" };
  const pool = getPool();
  try {
    await pool.query(`UPDATE motivational_quotes SET is_active = $2 WHERE id = $1::uuid`, [id, nextActive]);
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Не удалось обновить активность" };
  }
  revalidateMotivationAndPatientHome();
  return { ok: true };
}

export type ReorderState = { ok: boolean; error?: string };

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
  revalidateMotivationAndPatientHome();
  return { ok: true };
}
