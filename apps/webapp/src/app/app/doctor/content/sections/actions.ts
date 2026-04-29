"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { validateContentSectionSlug } from "@/shared/lib/contentSectionSlug";

export type SaveContentSectionState = { ok: true; savedSlug: string } | { ok: false; error: string };

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
  const requiresAuth = formData.get("requires_auth") === "on";
  const iconImageUrl = ((formData.get("icon_image_url") as string) ?? "").trim() || null;
  const coverImageUrl = ((formData.get("cover_image_url") as string) ?? "").trim() || null;

  const slugCheck = validateContentSectionSlug(slug);
  if (!slugCheck.ok) {
    return { ok: false, error: slugCheck.error };
  }
  if (!title) {
    return { ok: false, error: "Заполните slug и заголовок" };
  }
  if (title.length > 500) return { ok: false, error: "Заголовок слишком длинный" };
  if (description.length > 2000) return { ok: false, error: "Описание слишком длинное" };

  const savedSlug = slugCheck.slug;

  try {
    await deps.contentSections.upsert({
      slug: savedSlug,
      title,
      description,
      sortOrder,
      isVisible,
      requiresAuth,
      iconImageUrl,
      coverImageUrl,
    });
  } catch (err) {
    console.error("saveContentSection failed:", err);
    return { ok: false, error: "Не удалось сохранить раздел. Попробуйте ещё раз." };
  }

  revalidatePath("/app/doctor/content/sections");
  revalidatePath("/app/doctor/content");
  revalidatePath("/app/patient");
  revalidatePath("/app/patient/sections", "layout");
  return { ok: true, savedSlug };
}

export type RenameContentSectionSlugState = { ok: boolean; error?: string };

export async function renameContentSectionSlug(
  _prev: RenameContentSectionSlugState | null,
  formData: FormData,
): Promise<RenameContentSectionSlugState> {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();

  const oldSlug = (formData.get("old_slug") as string)?.trim() || "";
  const newSlugRaw = (formData.get("new_slug") as string)?.trim() || "";
  if (formData.get("confirm_rename") !== "on") {
    return { ok: false, error: "Отметьте подтверждение переименования" };
  }

  const renamed = await deps.contentSections.renameSectionSlug(oldSlug, newSlugRaw, {
    changedByUserId: session.user.userId,
  });
  if (!renamed.ok) {
    return { ok: false, error: renamed.error };
  }

  revalidatePath("/app/doctor/content/sections");
  revalidatePath("/app/doctor/content");
  revalidatePath("/app/patient");
  revalidatePath("/app/patient/sections", "layout");
  redirect(`/app/doctor/content/sections/edit/${encodeURIComponent(renamed.newSlug)}`);
}
