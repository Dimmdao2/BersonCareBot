"use server";

import { revalidatePath } from "next/cache";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  isImmutableSystemSectionSlug,
  isSystemParentCode,
  isValidSectionTaxonomy,
  taxonomyFromPlacement,
} from "@/modules/content-sections/types";
import type { SystemParentCode } from "@/modules/content-sections/types";
import { validateContentSectionSlug } from "@/shared/lib/contentSectionSlug";
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
  const placementRaw = (formData.get("placement") as string | null) ?? "";
  const trimmedPlacement = placementRaw.trim();
  const parsedPlacement =
    trimmedPlacement === ""
      ? ({ kind: "article" as const, systemParentCode: null })
      : taxonomyFromPlacement(trimmedPlacement);
  if (!parsedPlacement) {
    return { ok: false, error: "Выберите корректное расположение раздела" };
  }

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

  let existing: Awaited<ReturnType<typeof deps.contentSections.getBySlug>> = null;
  try {
    existing = await deps.contentSections.getBySlug(slug);
  } catch {
    /* ignore — upsert path will surface errors */
  }

  if (!existing && isImmutableSystemSectionSlug(slug)) {
    return { ok: false, error: "Этот slug зарезервирован для встроенного раздела приложения" };
  }

  let kind = parsedPlacement.kind;
  let systemParentCode = parsedPlacement.systemParentCode;
  if (!existing && trimmedPlacement === "system_root") {
    return { ok: false, error: "Новый раздел нельзя сохранить как встроенный корневой системный тип" };
  }
  if (existing && isImmutableSystemSectionSlug(slug)) {
    kind = existing.kind;
    systemParentCode = existing.systemParentCode;
  }
  if (!kind || !isValidSectionTaxonomy(kind, systemParentCode)) {
    return { ok: false, error: "Некорректное сочетание типа раздела и папки CMS" };
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
      kind,
      systemParentCode,
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

export type AttachArticleSectionToFolderState = { ok: boolean; error?: string };

/**
 * Перенос существующего раздела из каталога статей (`kind=article`) в системную папку CMS
 * (`kind=system` + `system_parent_code`).
 */
export async function attachArticleSectionToSystemFolder(
  _prev: AttachArticleSectionToFolderState | null,
  formData: FormData,
): Promise<AttachArticleSectionToFolderState> {
  await requireDoctorAccess();
  const deps = buildAppDeps();

  const slug = ((formData.get("section_slug") as string) ?? "").trim();
  const folderRaw = ((formData.get("system_parent_code") as string) ?? "").trim().toLowerCase();

  if (!slug) {
    return { ok: false, error: "Выберите раздел" };
  }
  if (!isSystemParentCode(folderRaw)) {
    return { ok: false, error: "Некорректная системная папка" };
  }
  const systemParentCode: SystemParentCode = folderRaw;

  if (isImmutableSystemSectionSlug(slug)) {
    return { ok: false, error: "Встроенный раздел нельзя переносить в папку таким образом" };
  }

  let existing: Awaited<ReturnType<typeof deps.contentSections.getBySlug>>;
  try {
    existing = await deps.contentSections.getBySlug(slug);
  } catch {
    return { ok: false, error: "Не удалось загрузить раздел" };
  }
  if (!existing) {
    return { ok: false, error: "Раздел не найден" };
  }
  if (existing.kind !== "article") {
    return { ok: false, error: "В папку можно добавить только раздел из каталога статей" };
  }

  const kind = "system" as const;
  if (!isValidSectionTaxonomy(kind, systemParentCode)) {
    return { ok: false, error: "Некорректное сочетание типа раздела и папки CMS" };
  }

  try {
    await deps.contentSections.update(slug, {
      kind,
      systemParentCode,
    });
  } catch (err) {
    console.error("attachArticleSectionToSystemFolder failed:", err);
    return { ok: false, error: "Не удалось перенести раздел. Попробуйте ещё раз." };
  }

  revalidatePath("/app/doctor/content/sections");
  revalidatePath("/app/doctor/content");
  revalidatePath("/app/patient");
  revalidatePath("/app/patient/sections", "layout");
  return { ok: true };
}

export type RenameContentSectionSlugState =
  | { ok: true; newSlug: string }
  | { ok: false; error: string }
  | null;

export async function renameContentSectionSlug(
  _prev: RenameContentSectionSlugState,
  formData: FormData,
): Promise<RenameContentSectionSlugState> {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();

  if (formData.get("confirm_rename") !== "on") {
    return { ok: false, error: "Подтвердите переименование slug" };
  }

  const oldParsed = validateContentSectionSlug((formData.get("old_slug") as string | null) ?? "");
  if (!oldParsed.ok) return { ok: false, error: oldParsed.error };
  const newParsed = validateContentSectionSlug((formData.get("new_slug") as string | null) ?? "");
  if (!newParsed.ok) return { ok: false, error: newParsed.error };
  if (oldParsed.slug === newParsed.slug) {
    return { ok: false, error: "Новый slug совпадает с текущим" };
  }
  if (isImmutableSystemSectionSlug(oldParsed.slug)) {
    return { ok: false, error: "Slug встроенного раздела нельзя переименовать" };
  }

  const result = await deps.contentSections.renameSectionSlug(oldParsed.slug, newParsed.slug, {
    changedByUserId: session.user.userId,
  });
  if (!result.ok) return result;

  revalidatePath("/app/doctor/content/sections");
  revalidatePath(`/app/doctor/content/sections/edit/${encodeURIComponent(result.newSlug)}`);
  revalidatePath("/app/doctor/content");
  revalidatePath("/app/patient");
  revalidatePath(`/app/patient/sections/${encodeURIComponent(oldParsed.slug)}`);
  revalidatePath(`/app/patient/sections/${encodeURIComponent(result.newSlug)}`);
  revalidatePath("/app/patient/sections", "layout");
  return { ok: true, newSlug: result.newSlug };
}
