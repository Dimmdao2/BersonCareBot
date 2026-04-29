"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { API_MEDIA_URL_RE, isLegacyAbsoluteUrl } from "@/shared/lib/mediaUrlPolicy";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";
import {
  isPatientHomeCmsBlockCode,
  patientHomeCmsBlockAllowsContentSection,
  type PatientHomeBlockCode,
  type PatientHomeBlockItemTargetType,
} from "@/modules/patient-home/blocks";
import { patientHomeBlockAllowsTargetType } from "@/modules/patient-home/service";

export type PatientHomeEditorActionResult = { ok: true } | { ok: false; error: string };

function revalidatePatientHomeSurfaces() {
  revalidatePath(routePaths.doctorPatientHome);
  revalidatePath("/app/patient");
  revalidatePath("/app/patient/sections", "layout");
}

export async function reorderPatientHomeBlockItemsAction(
  blockCode: string,
  orderedIds: string[],
): Promise<PatientHomeEditorActionResult> {
  await requireDoctorAccess();
  if (!isPatientHomeCmsBlockCode(blockCode)) {
    return { ok: false, error: "Неизвестный блок" };
  }
  const deps = buildAppDeps();
  try {
    await deps.patientHome.reorderCmsBlockItems(blockCode, orderedIds);
    revalidatePatientHomeSurfaces();
    return { ok: true };
  } catch (e) {
    const msg = typeof e === "object" && e !== null && (e as { message?: string }).message;
    if (msg === "reorder_items_invalid_id") {
      return { ok: false, error: "Порядок элементов не совпадает с сервером. Обновите страницу." };
    }
    console.error("reorderPatientHomeBlockItemsAction failed:", e);
    return { ok: false, error: "Не удалось сохранить порядок." };
  }
}

export async function togglePatientHomeBlockItemVisibilityAction(
  blockCode: string,
  itemId: string,
  visible: boolean,
): Promise<PatientHomeEditorActionResult> {
  await requireDoctorAccess();
  if (!isPatientHomeCmsBlockCode(blockCode)) {
    return { ok: false, error: "Неизвестный блок" };
  }
  const deps = buildAppDeps();
  const ok = await deps.patientHome.assertItemBelongsToBlock(itemId, blockCode);
  if (!ok) return { ok: false, error: "Элемент не найден в этом блоке." };
  try {
    await deps.patientHome.setCmsItemVisible(itemId, visible);
    revalidatePatientHomeSurfaces();
    return { ok: true };
  } catch (e) {
    console.error("togglePatientHomeBlockItemVisibilityAction failed:", e);
    return { ok: false, error: "Не удалось изменить видимость." };
  }
}

export async function deletePatientHomeBlockItemAction(
  blockCode: string,
  itemId: string,
): Promise<PatientHomeEditorActionResult> {
  await requireDoctorAccess();
  if (!isPatientHomeCmsBlockCode(blockCode)) {
    return { ok: false, error: "Неизвестный блок" };
  }
  const deps = buildAppDeps();
  const ok = await deps.patientHome.assertItemBelongsToBlock(itemId, blockCode);
  if (!ok) return { ok: false, error: "Элемент не найден в этом блоке." };
  try {
    await deps.patientHome.deleteCmsItem(itemId);
    revalidatePatientHomeSurfaces();
    return { ok: true };
  } catch (e) {
    console.error("deletePatientHomeBlockItemAction failed:", e);
    return { ok: false, error: "Не удалось удалить элемент." };
  }
}

export type RepairPatientHomeBlockItemResult =
  | { ok: true; items: import("@/modules/patient-home/patientHomeEditorDemo").PatientHomeEditorItemRow[] }
  | { ok: false; error: string };

export async function repairPatientHomeBlockItemAction(
  blockCode: string,
  _itemId: string,
): Promise<RepairPatientHomeBlockItemResult> {
  await requireDoctorAccess();
  if (!isPatientHomeCmsBlockCode(blockCode)) {
    return { ok: false, error: "Неизвестный блок" };
  }
  const deps = buildAppDeps();
  try {
    const items = await deps.patientHome.listRefreshedEditorItemsForBlock(blockCode);
    revalidatePatientHomeSurfaces();
    return { ok: true, items };
  } catch (e) {
    console.error("repairPatientHomeBlockItemAction failed:", e);
    return { ok: false, error: "Не удалось обновить данные блока." };
  }
}

export async function setPatientHomeBlockVisibilityAction(
  blockCode: string,
  visible: boolean,
): Promise<PatientHomeEditorActionResult> {
  await requireDoctorAccess();
  if (!isPatientHomeCmsBlockCode(blockCode)) {
    return { ok: true };
  }
  const deps = buildAppDeps();
  try {
    await deps.patientHome.setCmsBlockVisible(blockCode, visible);
    revalidatePatientHomeSurfaces();
    return { ok: true };
  } catch (e) {
    console.error("setPatientHomeBlockVisibilityAction failed:", e);
    return { ok: false, error: "Не удалось изменить видимость блока." };
  }
}

const targetTypeSchema = z.enum(["content_section", "content_page", "course"]);

export type AddPatientHomeBlockItemResult =
  | {
      ok: true;
      item: import("@/modules/patient-home/patientHomeEditorDemo").PatientHomeEditorItemRow;
    }
  | { ok: false; error: string };

export async function addPatientHomeBlockItemAction(
  blockCode: string,
  raw: { targetType: string; targetRef: string },
): Promise<AddPatientHomeBlockItemResult> {
  await requireDoctorAccess();
  if (!isPatientHomeCmsBlockCode(blockCode)) {
    return { ok: false, error: "Неизвестный блок" };
  }
  const parsed = z
    .object({
      targetType: targetTypeSchema,
      targetRef: z.string().trim().min(1),
    })
    .safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Некорректные данные" };
  }
  const { targetType, targetRef } = parsed.data as {
    targetType: PatientHomeBlockItemTargetType;
    targetRef: string;
  };
  if (!patientHomeBlockAllowsTargetType(blockCode, targetType)) {
    return { ok: false, error: "Этот тип цели нельзя добавить в выбранный блок." };
  }
  const deps = buildAppDeps();
  try {
    const id = await deps.patientHome.addCmsBlockItem(blockCode, targetType, targetRef);
    const items = await deps.patientHome.listRefreshedEditorItemsForBlock(blockCode);
    const row = items.find((i) => i.id === id);
    if (!row) {
      return { ok: false, error: "Элемент создан, но не удалось прочитать состояние. Обновите страницу." };
    }
    revalidatePatientHomeSurfaces();
    return { ok: true, item: row };
  } catch (e) {
    const code = typeof e === "object" && e !== null ? (e as { message?: string }).message : "";
    if (code === "duplicate_block_item") {
      return { ok: false, error: "Такой элемент уже есть в блоке." };
    }
    if (code === "invalid_target_type_for_block") {
      return { ok: false, error: "Недопустимый тип цели для блока." };
    }
    console.error("addPatientHomeBlockItemAction failed:", e);
    return { ok: false, error: "Не удалось добавить элемент." };
  }
}

const createSectionBodySchema = z.object({
  blockCode: z.string().trim(),
  title: z.string().trim().min(1, "Укажите заголовок").max(500, "Заголовок слишком длинный"),
  slug: z.string().trim().min(1, "Укажите slug").max(200, "Slug слишком длинный"),
  description: z.string().max(2000, "Описание слишком длинное").optional(),
  sortOrder: z.coerce.number().int().finite().optional(),
  isVisible: z.boolean(),
  requiresAuth: z.boolean(),
  iconImageUrl: z.string().max(500).optional(),
  coverImageUrl: z.string().max(500).optional(),
});

export type CreateContentSectionForPatientHomeInput = z.infer<typeof createSectionBodySchema>;

export type CreateContentSectionForPatientHomeResult =
  | {
      ok: true;
      item: {
        id: string;
        targetType: "content_section";
        targetRef: string;
        title: string;
        isVisible: boolean;
        resolved: true;
      };
    }
  | { ok: false; error: string };

function validateOptionalMediaUrl(url: string, label: string): string | null {
  const t = url.trim();
  if (!t) return null;
  if (API_MEDIA_URL_RE.test(t) || isLegacyAbsoluteUrl(t)) return null;
  return `URL ${label}: укажите ссылку вида /api/media/… или https://…`;
}

function validateSlugPattern(slug: string): string | null {
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return "Slug: только латиница, цифры и дефис";
  }
  if (/^-+$/.test(slug)) {
    return "Slug не может состоять только из дефисов";
  }
  return null;
}

/**
 * Создаёт `content_section`, добавляет элемент в `patient_home_block_items` и возвращает строку редактора.
 */
export async function createContentSectionForPatientHomeBlock(
  raw: CreateContentSectionForPatientHomeInput,
): Promise<CreateContentSectionForPatientHomeResult> {
  await requireDoctorAccess();

  const parsed = createSectionBodySchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Некорректные данные";
    return { ok: false, error: msg };
  }
  const { title, slug, isVisible, requiresAuth } = parsed.data;
  const description = (parsed.data.description ?? "").trim();
  const sortOrder = parsed.data.sortOrder ?? 0;
  const code = parsed.data.blockCode as PatientHomeBlockCode;

  if (!isPatientHomeCmsBlockCode(code)) {
    return { ok: false, error: "Блок не поддерживает контентные элементы" };
  }
  if (!patientHomeCmsBlockAllowsContentSection(code)) {
    return { ok: false, error: "Для этого блока нельзя создать раздел из редактора" };
  }

  const iconErr = validateOptionalMediaUrl(parsed.data.iconImageUrl ?? "", "иконки");
  if (iconErr) return { ok: false, error: iconErr };
  const coverErr = validateOptionalMediaUrl(parsed.data.coverImageUrl ?? "", "обложки");
  if (coverErr) return { ok: false, error: coverErr };

  const slugErr = validateSlugPattern(slug);
  if (slugErr) return { ok: false, error: slugErr };

  const deps = buildAppDeps();

  try {
    const existing = await deps.contentSections.getBySlug(slug);
    if (existing) {
      return { ok: false, error: "Раздел с таким slug уже существует" };
    }

    await deps.contentSections.upsert({
      slug,
      title,
      description,
      sortOrder,
      isVisible,
      requiresAuth,
      iconImageUrl: parsed.data.iconImageUrl?.trim() || null,
      coverImageUrl: parsed.data.coverImageUrl?.trim() || null,
    });

    let itemId: string;
    try {
      itemId = await deps.patientHome.addCmsBlockItem(code, "content_section", slug);
    } catch (e) {
      const msg = typeof e === "object" && e !== null ? (e as { message?: string }).message : "";
      if (msg === "duplicate_block_item") {
        return { ok: false, error: "Раздел уже привязан к этому блоку." };
      }
      throw e;
    }

    revalidatePath(routePaths.doctorPatientHome);
    revalidatePath("/app/doctor/content/sections");
    revalidatePath("/app/doctor/content");
    revalidatePath("/app/patient");
    revalidatePath("/app/patient/sections", "layout");

    return {
      ok: true,
      item: {
        id: itemId,
        targetType: "content_section",
        targetRef: slug,
        title,
        isVisible,
        resolved: true,
      },
    };
  } catch (err) {
    console.error("createContentSectionForPatientHomeBlock failed:", err);
    return { ok: false, error: "Не удалось создать раздел. Попробуйте ещё раз." };
  }
}
