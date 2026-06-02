"use server";

import { revalidatePath } from "next/cache";
import { revalidatePatientContentPaths } from "@/app-layer/content/revalidatePatientContentPaths";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export type LifecycleState = { ok: boolean; error?: string };

export async function applyContentLifecycle(_prev: LifecycleState | null, formData: FormData): Promise<LifecycleState> {
  await requireDoctorAccess();
  const id = (formData.get("id") as string)?.trim();
  const op = (formData.get("op") as string)?.trim();
  if (!id || !op) return { ok: false, error: "Некорректные данные" };

  const deps = buildAppDeps();
  const page = await deps.contentPages.getById(id);
  const now = new Date().toISOString();

  try {
    switch (op) {
      case "publish":
        await deps.contentPages.updateLifecycle(id, { isPublished: true });
        break;
      case "unpublish":
        await deps.contentPages.updateLifecycle(id, { isPublished: false });
        break;
      case "archive":
        await deps.contentPages.updateLifecycle(id, { archivedAt: now });
        break;
      case "unarchive":
        await deps.contentPages.updateLifecycle(id, { archivedAt: null });
        break;
      case "soft_delete":
        await deps.contentPages.updateLifecycle(id, { deletedAt: now });
        break;
      case "restore":
        await deps.contentPages.updateLifecycle(id, { deletedAt: null });
        break;
      default:
        return { ok: false, error: "Неизвестное действие" };
    }
  } catch (e) {
    console.error("applyContentLifecycle", e);
    return { ok: false, error: "Не удалось применить действие" };
  }

  revalidatePath("/app/doctor/content");
  revalidatePath("/app/patient/content");
  if (page) {
    revalidatePatientContentPaths({
      slug: page.slug,
      section: page.section,
      revalidateSectionsLayout: true,
    });
  } else {
    revalidatePath("/app/patient/sections", "layout");
  }
  return { ok: true };
}

/** Для `<form action={…}>` без `useActionState` (один аргумент FormData). */
export async function applyContentLifecycleForm(formData: FormData): Promise<void> {
  await applyContentLifecycle(null, formData);
}
