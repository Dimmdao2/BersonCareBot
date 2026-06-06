"use server";

import { revalidatePath } from "next/cache";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
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

  try {
    const deps = buildAppDeps();
    await deps.doctorMotivationQuotesEditor.upsertQuote({
      id: id || undefined,
      bodyText,
      author,
      isActive,
      sortOrder,
    });
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
  const deps = buildAppDeps();
  await deps.doctorMotivationQuotesEditor.setQuoteArchived(id, archived);
  revalidateMotivationAndPatientHome();
  return { ok: true };
}

export async function setQuoteActive(id: string, nextActive: boolean): Promise<MotivationActionState> {
  await requireDoctorAccess();
  if (!env.DATABASE_URL) return { ok: false, error: "База данных недоступна" };
  try {
    const deps = buildAppDeps();
    await deps.doctorMotivationQuotesEditor.setQuoteActive(id, nextActive);
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

  try {
    const deps = buildAppDeps();
    await deps.doctorMotivationQuotesEditor.reorderQuotes(ids);
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Не удалось сохранить порядок" };
  }
  revalidateMotivationAndPatientHome();
  return { ok: true };
}
