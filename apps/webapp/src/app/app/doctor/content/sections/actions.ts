"use server";

import { revalidatePath } from "next/cache";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export type SaveContentSectionState = { ok: boolean; error?: string };

export async function saveContentSection(
  _prev: SaveContentSectionState | null,
  formData: FormData,
): Promise<SaveContentSectionState> {
  await requireDoctorAccess();
  const deps = buildAppDeps();

  const slug = (formData.get("slug") as string)?.trim() || "";
  const title = (formData.get("title") as string)?.trim() || "";
  const description = (formData.get("description") as string)?.trim() || "";
  const sortOrder = parseInt(formData.get("sort_order") as string, 10) || 0;
  const isVisible = formData.get("is_visible") === "on";

  if (!slug || !title) {
    return { ok: false, error: "Заполните slug и заголовок" };
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { ok: false, error: "Slug: только латиница, цифры и дефис" };
  }
  if (title.length > 500) return { ok: false, error: "Заголовок слишком длинный" };
  if (description.length > 2000) return { ok: false, error: "Описание слишком длинное" };

  try {
    await deps.contentSections.upsert({
      slug,
      title,
      description,
      sortOrder,
      isVisible,
    });
  } catch (err) {
    console.error("saveContentSection failed:", err);
    return { ok: false, error: "Не удалось сохранить раздел. Попробуйте ещё раз." };
  }

  revalidatePath("/app/doctor/content/sections");
  revalidatePath("/app/doctor/content");
  revalidatePath("/app/patient");
  revalidatePath("/app/patient/sections", "layout");
  return { ok: true };
}
