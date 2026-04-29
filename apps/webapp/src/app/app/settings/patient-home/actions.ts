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
} from "@/modules/patient-home/blocks";

export type PatientHomeEditorActionResult = { ok: true } | { ok: false; error: string };

function bump(): PatientHomeEditorActionResult {
  /** Ревалидация страницы редактора; запись в БД `patient_home_*` подключится без смены контракта действий. */
  revalidatePath(routePaths.doctorPatientHome);
  return { ok: true };
}

export async function reorderPatientHomeBlockItemsAction(
  _blockCode: string,
  _orderedIds: string[],
): Promise<PatientHomeEditorActionResult> {
  return bump();
}

export async function togglePatientHomeBlockItemVisibilityAction(
  _blockCode: string,
  _itemId: string,
  _visible: boolean,
): Promise<PatientHomeEditorActionResult> {
  return bump();
}

export async function deletePatientHomeBlockItemAction(
  _blockCode: string,
  _itemId: string,
): Promise<PatientHomeEditorActionResult> {
  return bump();
}

export async function repairPatientHomeBlockItemAction(
  _blockCode: string,
  _itemId: string,
): Promise<PatientHomeEditorActionResult> {
  return bump();
}

export async function setPatientHomeBlockVisibilityAction(
  _blockCode: string,
  _visible: boolean,
): Promise<PatientHomeEditorActionResult> {
  return bump();
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
 * Создаёт `content_section` и возвращает строку для редактора блока.
 * Запись в `patient_home_block_items` отложена до миграции таблиц — элемент добавляется в UI из ответа action.
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

    const id = await deps.contentSections.upsert({
      slug,
      title,
      description,
      sortOrder,
      isVisible,
      requiresAuth,
    });

    revalidatePath(routePaths.doctorPatientHome);
    revalidatePath("/app/doctor/content/sections");
    revalidatePath("/app/doctor/content");
    revalidatePath("/app/patient");
    revalidatePath("/app/patient/sections", "layout");

    return {
      ok: true,
      item: {
        id,
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
