"use server";

/**
 * Серверные действия для страницы дневника ЛФК.
 * Используются при отправке формы «Отметить занятие» на странице /app/patient/diary/lfk.
 */

import { revalidatePath } from "next/cache";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

/** Принимает данные формы, проверяет доступ пациента и комплекс, сохраняет отметку занятия и обновляет страницу. */
export async function markLfkSession(formData: FormData) {
  const session = await requirePatientAccess();
  const complexId = formData.get("complexId");
  if (typeof complexId !== "string" || !complexId.trim()) {
    return;
  }
  const deps = buildAppDeps();
  const complexes = await deps.diaries.listLfkComplexes(session.user.userId);
  if (!complexes.some((c) => c.id === complexId.trim())) {
    return;
  }
  try {
    await deps.diaries.addLfkSession({
      userId: session.user.userId,
      complexId: complexId.trim(),
      source: "webapp",
    });
  } catch (err) {
    console.error("markLfkSession failed:", err);
    return;
  }
  revalidatePath("/app/patient/diary/lfk");
}

export async function createLfkComplex(formData: FormData) {
  const session = await requirePatientAccess();
  const title = (formData.get("complexTitle") as string)?.trim();
  if (!title) return;
  if (title.length > 200) return;
  const deps = buildAppDeps();
  try {
    await deps.diaries.createLfkComplex({
      userId: session.user.userId,
      title,
    });
  } catch (err) {
    console.error("createLfkComplex failed:", err);
    return;
  }
  revalidatePath("/app/patient/diary/lfk");
}
