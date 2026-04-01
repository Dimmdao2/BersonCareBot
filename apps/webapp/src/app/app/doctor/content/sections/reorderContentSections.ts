"use server";

import { revalidatePath } from "next/cache";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export type ReorderContentSectionsState = { ok: boolean; error?: string };

export async function reorderContentSections(orderedSlugs: string[]): Promise<ReorderContentSectionsState> {
  await requireDoctorAccess();
  if (!Array.isArray(orderedSlugs) || orderedSlugs.length === 0) {
    return { ok: false, error: "Пустой порядок" };
  }
  const slugs = orderedSlugs.map((s) => String(s).trim()).filter(Boolean);
  if (slugs.length !== orderedSlugs.length) return { ok: false, error: "Некорректные slug" };

  const deps = buildAppDeps();
  try {
    await deps.contentSections.reorderSlugs(slugs);
  } catch (e) {
    console.error("reorderContentSections", e);
    return { ok: false, error: "Не удалось сохранить порядок" };
  }

  revalidatePath("/app/doctor/content/sections");
  revalidatePath("/app/doctor/content");
  revalidatePath("/app/patient");
  revalidatePath("/app/patient/sections", "layout");
  return { ok: true };
}
