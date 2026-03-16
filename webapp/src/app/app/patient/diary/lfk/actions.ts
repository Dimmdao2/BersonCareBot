"use server";

import { revalidatePath } from "next/cache";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

/** Отметить занятие ЛФК по выбранному комплексу. Комплекс должен существовать (добавить можно в боте). */
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
  await deps.diaries.addLfkSession({
    userId: session.user.userId,
    complexId: complexId.trim(),
    source: "webapp",
  });
  revalidatePath("/app/patient/diary/lfk");
}
