"use server";

import { revalidatePath } from "next/cache";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { API_MEDIA_URL_RE, isLegacyAbsoluteUrl } from "@/shared/lib/mediaUrlPolicy";

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
  const requiresAuth = formData.get("requires_auth") === "on";
  const coverImageUrlRaw = (formData.get("cover_image_url") as string)?.trim() || "";
  const iconImageUrlRaw = (formData.get("icon_image_url") as string)?.trim() || "";
  const coverImageUrl = coverImageUrlRaw.length > 0 ? coverImageUrlRaw : null;
  const iconImageUrl = iconImageUrlRaw.length > 0 ? iconImageUrlRaw : null;

  if (!slug || !title) {
    return { ok: false, error: "Заполните slug и заголовок" };
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { ok: false, error: "Slug: только латиница, цифры и дефис" };
  }
  if (/^-+$/.test(slug)) {
    return { ok: false, error: "Slug не может состоять только из дефисов" };
  }
  if (title.length > 500) return { ok: false, error: "Заголовок слишком длинный" };
  if (description.length > 2000) return { ok: false, error: "Описание слишком длинное" };
  if (coverImageUrl && !API_MEDIA_URL_RE.test(coverImageUrl) && !isLegacyAbsoluteUrl(coverImageUrl)) {
    return { ok: false, error: "Обложка должна быть выбрана из библиотеки файлов" };
  }
  if (iconImageUrl && !API_MEDIA_URL_RE.test(iconImageUrl) && !isLegacyAbsoluteUrl(iconImageUrl)) {
    return { ok: false, error: "Иконка должна быть выбрана из библиотеки файлов" };
  }

  try {
    await deps.contentSections.upsert({
      slug,
      title,
      description,
      sortOrder,
      isVisible,
      requiresAuth,
      coverImageUrl,
      iconImageUrl,
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

/**
 * Stub-server-action для slug rename. Реализация переносится в follow-up задачу
 * (см. `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/SLUG_RENAME_WIRING_TASK.md`).
 * `SectionSlugRenameDialog` — готовый UI; action и интеграция в `SectionForm` —
 * следующий шаг (GPT 5.5).
 */
export type RenameContentSectionSlugState =
  | { ok: true; newSlug: string }
  | { ok: false; error: string }
  | null;

export async function renameContentSectionSlug(
  _prev: RenameContentSectionSlugState,
  _formData: FormData,
): Promise<RenameContentSectionSlugState> {
  return {
    ok: false,
    error:
      "Переименование slug не подключено в этом релизе. Реализация запланирована follow-up задачей (см. SLUG_RENAME_WIRING_TASK.md).",
  };
}
