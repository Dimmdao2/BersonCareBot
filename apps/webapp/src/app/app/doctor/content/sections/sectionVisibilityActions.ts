"use server";

import { revalidatePath } from "next/cache";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export type SectionVisibilityState = { ok: boolean; error?: string };

export async function setSectionVisibility(slug: string, isVisible: boolean): Promise<SectionVisibilityState> {
  await requireDoctorAccess();
  const s = slug?.trim();
  if (!s) return { ok: false, error: "Нет slug" };

  const deps = buildAppDeps();
  try {
    await deps.contentSections.update(s, { isVisible });
  } catch (e) {
    console.error("setSectionVisibility", e);
    return { ok: false, error: "Не удалось обновить видимость" };
  }

  revalidatePath("/app/doctor/content/sections");
  revalidatePath("/app/doctor/content");
  revalidatePath("/app/patient");
  revalidatePath("/app/patient/sections", "layout");
  revalidatePath("/api/menu");
  return { ok: true };
}
