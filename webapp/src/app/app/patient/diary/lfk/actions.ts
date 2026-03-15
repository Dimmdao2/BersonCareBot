"use server";

import { revalidatePath } from "next/cache";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

/** Отметить занятие ЛФК (без выбора комплекса). */
export async function markLfkSession() {
  const session = await requirePatientAccess();
  const deps = buildAppDeps();
  await deps.diaries.addLfkSession({ userId: session.user.userId });
  revalidatePath("/app/patient/diary/lfk");
}
