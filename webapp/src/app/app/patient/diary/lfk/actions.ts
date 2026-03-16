"use server";

import { revalidatePath } from "next/cache";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

/** Отметить занятие ЛФК. Если у пользователя нет комплексов, создаётся один по умолчанию. */
export async function markLfkSession() {
  const session = await requirePatientAccess();
  const deps = buildAppDeps();
  const complexes = await deps.diaries.listLfkComplexes(session.user.userId);
  let complexId: string;
  if (complexes.length > 0) {
    complexId = complexes[0].id;
  } else {
    const created = await deps.diaries.createLfkComplex({
      userId: session.user.userId,
      title: "Занятие ЛФК",
    });
    complexId = created.id;
  }
  await deps.diaries.addLfkSession({
    userId: session.user.userId,
    complexId,
    source: "webapp",
  });
  revalidatePath("/app/patient/diary/lfk");
}
