"use server";

import { revalidatePath } from "next/cache";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export type ReorderContentPagesState = { ok: boolean; error?: string };

export async function reorderContentPagesInSection(
  section: string,
  orderedIds: string[],
): Promise<ReorderContentPagesState> {
  await requireDoctorAccess();
  const sec = section?.trim();
  if (!sec) return { ok: false, error: "Не указан раздел" };
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false, error: "Пустой порядок" };
  }
  const ids = orderedIds.map((id) => String(id).trim()).filter(Boolean);
  if (ids.length !== orderedIds.length) return { ok: false, error: "Некорректные id" };

  const deps = buildAppDeps();
  try {
    await deps.contentPages.reorderInSection(sec, ids);
  } catch (e) {
    console.error("reorderContentPagesInSection", e);
    return { ok: false, error: "Не удалось сохранить порядок" };
  }

  revalidatePath("/app/doctor/content");
  revalidatePath("/app/patient/sections", "layout");
  revalidatePath("/app/patient/content");
  return { ok: true };
}
