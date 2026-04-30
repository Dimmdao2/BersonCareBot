"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { canAccessDoctor } from "@/modules/roles/service";
import {
  allowedTargetTypesForBlock,
  isPatientHomeBlockCode,
  supportsConfigurablePatientHomeBlockIcon,
} from "@/modules/patient-home/blocks";
import type { PatientHomeBlockItemTargetType } from "@/modules/patient-home/ports";
import { PATIENT_HOME_USEFUL_POST_BADGE_LABEL } from "@/modules/patient-home/usefulPostPresentation";
import { validateContentSectionSlug } from "@/shared/lib/contentSectionSlug";
import { API_MEDIA_URL_RE, isLegacyAbsoluteUrl } from "@/shared/lib/mediaUrlPolicy";

const targetTypeSchema = z.enum(["content_page", "content_section", "course", "static_action"]);
const uuidSchema = z.string().uuid();

/** UUID `patient_home_block_items.id` (trim). */
function parsePatientHomeItemId(raw: string | undefined | null): { ok: true; id: string } | { ok: false; error: string } {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return { ok: false, error: "empty_item_id" };
  if (!uuidSchema.safeParse(trimmed).success) return { ok: false, error: "invalid_item_id" };
  return { ok: true, id: trimmed };
}

function parsePatientHomeItemIdList(
  raw: string[],
): { ok: true; ids: string[] } | { ok: false; error: string } {
  if (raw.length === 0) return { ok: false, error: "invalid_item_id" };
  const ids: string[] = [];
  for (const x of raw) {
    const p = parsePatientHomeItemId(x);
    if (!p.ok) return p;
    ids.push(p.id);
  }
  return { ok: true, ids };
}

const retargetPatientHomeItemInputSchema = z
  .object({
    itemId: z.string(),
    targetType: z.string(),
    targetRef: z.string(),
  })
  .superRefine((val, ctx) => {
    const itemId = val.itemId.trim();
    if (!itemId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "empty_item_id", path: ["itemId"] });
      return;
    }
    if (!uuidSchema.safeParse(itemId).success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "invalid_item_id", path: ["itemId"] });
      return;
    }
    if (!targetTypeSchema.safeParse(val.targetType.trim()).success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "invalid_target_type", path: ["targetType"] });
      return;
    }
    const targetRef = val.targetRef.trim();
    if (!targetRef) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "empty_target_ref", path: ["targetRef"] });
    }
  })
  .transform((val) => ({
    itemId: val.itemId.trim(),
    targetType: targetTypeSchema.parse(val.targetType.trim()),
    targetRef: val.targetRef.trim(),
  }));

type ActionState = { ok: true } | { ok: false; error: string };

function fail(error: string): ActionState {
  return { ok: false, error };
}

async function requireDoctorForPatientHomeBlocks(): Promise<void> {
  const session = await getCurrentSession();
  if (!session || !canAccessDoctor(session.user.role)) {
    throw new Error("forbidden");
  }
}

function revalidatePatientHomeSettings(): void {
  revalidatePath("/app/settings/patient-home");
  revalidatePath("/app/doctor/patient-home");
  revalidatePath("/app/patient");
  revalidatePath("/app/patient/sections", "layout");
  revalidatePath("/app/patient/sections");
}

export async function togglePatientHomeBlockVisibility(
  code: string,
  visible: boolean,
): Promise<ActionState> {
  try {
    await requireDoctorForPatientHomeBlocks();
    if (!isPatientHomeBlockCode(code)) return fail("invalid_block_code");
    const deps = buildAppDeps();
    await deps.patientHomeBlocks.setBlockVisibility(code, visible);
    revalidatePatientHomeSettings();
    return { ok: true };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "toggle_failed");
  }
}

export async function setPatientHomeBlockIcon(code: string, iconImageUrl: string | null): Promise<ActionState> {
  try {
    await requireDoctorForPatientHomeBlocks();
    if (!isPatientHomeBlockCode(code)) return fail("invalid_block_code");
    if (!supportsConfigurablePatientHomeBlockIcon(code)) return fail("block_icon_not_supported");
    const raw = typeof iconImageUrl === "string" ? iconImageUrl.trim() : "";
    const normalized = raw.length > 0 ? raw : null;
    if (normalized && !API_MEDIA_URL_RE.test(normalized) && !isLegacyAbsoluteUrl(normalized)) {
      return fail("Иконка должна быть выбрана из библиотеки файлов");
    }
    const deps = buildAppDeps();
    await deps.patientHomeBlocks.setBlockIcon(code, normalized);
    revalidatePatientHomeSettings();
    return { ok: true };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "set_block_icon_failed");
  }
}

export async function reorderPatientHomeBlocks(orderedCodes: string[]): Promise<ActionState> {
  try {
    await requireDoctorForPatientHomeBlocks();
    const deps = buildAppDeps();
    await deps.patientHomeBlocks.reorderBlocks(orderedCodes);
    revalidatePatientHomeSettings();
    return { ok: true };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "reorder_blocks_failed");
  }
}

export async function addPatientHomeItem(input: {
  blockCode: string;
  targetType: string;
  targetRef: string;
}): Promise<ActionState> {
  try {
    await requireDoctorForPatientHomeBlocks();
    if (!isPatientHomeBlockCode(input.blockCode)) return fail("invalid_block_code");
    const targetTypeParsed = targetTypeSchema.safeParse(input.targetType);
    if (!targetTypeParsed.success) return fail("invalid_target_type");
    const deps = buildAppDeps();
    await deps.patientHomeBlocks.addItem({
      blockCode: input.blockCode,
      targetType: targetTypeParsed.data as PatientHomeBlockItemTargetType,
      targetRef: input.targetRef,
      isVisible: true,
    });
    revalidatePatientHomeSettings();
    return { ok: true };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "add_item_failed");
  }
}

export async function updatePatientHomeItemVisibility(
  itemId: string,
  visible: boolean,
): Promise<ActionState> {
  try {
    await requireDoctorForPatientHomeBlocks();
    const idParsed = parsePatientHomeItemId(itemId);
    if (!idParsed.ok) return fail(idParsed.error);
    const deps = buildAppDeps();
    await deps.patientHomeBlocks.updateItem(idParsed.id, { isVisible: visible });
    revalidatePatientHomeSettings();
    return { ok: true };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "update_item_failed");
  }
}

export async function updatePatientHomeItemPresentation(input: {
  itemId: string;
  badgeLabel?: string | null;
  showTitle?: boolean;
}): Promise<ActionState> {
  try {
    await requireDoctorForPatientHomeBlocks();
    const idParsed = parsePatientHomeItemId(input.itemId);
    if (!idParsed.ok) return fail(idParsed.error);

    const deps = buildAppDeps();
    const item = await deps.patientHomeBlocks.getItemById(idParsed.id);
    if (!item || item.blockCode !== "useful_post") return fail("invalid_item_for_badge");

    const patch: { badgeLabel?: string | null; showTitle?: boolean } = {};
    if (input.badgeLabel !== undefined) {
      const raw = input.badgeLabel;
      if (raw === null || (typeof raw === "string" && raw.trim() === "")) {
        patch.badgeLabel = null;
      } else if (typeof raw === "string" && raw.trim() === PATIENT_HOME_USEFUL_POST_BADGE_LABEL) {
        patch.badgeLabel = PATIENT_HOME_USEFUL_POST_BADGE_LABEL;
      } else {
        return fail("invalid_badge_label");
      }
    }
    if (input.showTitle !== undefined) {
      patch.showTitle = input.showTitle;
    }

    await deps.patientHomeBlocks.updateItem(idParsed.id, patch);
    revalidatePatientHomeSettings();
    return { ok: true };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "update_item_presentation_failed");
  }
}

export async function deletePatientHomeItem(itemId: string): Promise<ActionState> {
  try {
    await requireDoctorForPatientHomeBlocks();
    const idParsed = parsePatientHomeItemId(itemId);
    if (!idParsed.ok) return fail(idParsed.error);
    const deps = buildAppDeps();
    await deps.patientHomeBlocks.deleteItem(idParsed.id);
    revalidatePatientHomeSettings();
    return { ok: true };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "delete_item_failed");
  }
}

export async function reorderPatientHomeItems(
  blockCode: string,
  orderedItemIds: string[],
): Promise<ActionState> {
  try {
    await requireDoctorForPatientHomeBlocks();
    if (!isPatientHomeBlockCode(blockCode)) return fail("invalid_block_code");
    const idsParsed = parsePatientHomeItemIdList(orderedItemIds);
    if (!idsParsed.ok) return fail(idsParsed.error);
    const deps = buildAppDeps();
    await deps.patientHomeBlocks.reorderItems(blockCode, idsParsed.ids);
    revalidatePatientHomeSettings();
    return { ok: true };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "reorder_items_failed");
  }
}

export async function retargetPatientHomeItem(input: {
  itemId: string;
  targetType: string;
  targetRef: string;
}): Promise<ActionState> {
  try {
    await requireDoctorForPatientHomeBlocks();
    const parsed = retargetPatientHomeItemInputSchema.safeParse(input);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "retarget_failed";
      return fail(msg);
    }
    const deps = buildAppDeps();
    await deps.patientHomeBlocks.updateItem(parsed.data.itemId, {
      targetType: parsed.data.targetType as PatientHomeBlockItemTargetType,
      targetRef: parsed.data.targetRef,
    });
    revalidatePatientHomeSettings();
    return { ok: true };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "retarget_failed");
  }
}

export async function createContentSectionForPatientHomeBlock(input: {
  blockCode: string;
  title: string;
  slug: string;
  description?: string;
  sortOrder?: number;
  isVisible?: boolean;
  requiresAuth?: boolean;
  coverImageUrl?: string | null;
  iconImageUrl?: string | null;
}): Promise<{ ok: true; itemId: string; sectionSlug: string } | { ok: false; error: string }> {
  try {
    await requireDoctorForPatientHomeBlocks();
    if (!isPatientHomeBlockCode(input.blockCode)) {
      return { ok: false, error: "invalid_block_code" };
    }
    if (!allowedTargetTypesForBlock(input.blockCode).includes("content_section")) {
      return { ok: false, error: "invalid_target_type_for_block" };
    }

    const title = input.title.trim();
    if (!title) {
      return { ok: false, error: "empty_title" };
    }
    if (title.length > 500) {
      return { ok: false, error: "title_too_long" };
    }

    const slugParsed = validateContentSectionSlug(input.slug);
    if (!slugParsed.ok) {
      return { ok: false, error: slugParsed.error };
    }
    const slug = slugParsed.slug;

    const description = (input.description ?? "").trim();
    if (description.length > 2000) {
      return { ok: false, error: "description_too_long" };
    }

    const rawSort = input.sortOrder;
    const sortOrder =
      typeof rawSort === "number" && Number.isFinite(rawSort) ? Math.trunc(rawSort) : Number.parseInt(String(rawSort ?? 0), 10) || 0;

    const isVisible = input.isVisible ?? true;
    const requiresAuth = input.requiresAuth ?? false;

    const coverRaw = input.coverImageUrl?.trim() ?? "";
    const iconRaw = input.iconImageUrl?.trim() ?? "";
    const coverImageUrl = coverRaw.length > 0 ? coverRaw : null;
    const iconImageUrl = iconRaw.length > 0 ? iconRaw : null;

    if (coverImageUrl && !API_MEDIA_URL_RE.test(coverImageUrl) && !isLegacyAbsoluteUrl(coverImageUrl)) {
      return { ok: false, error: "Обложка должна быть выбрана из библиотеки файлов" };
    }
    if (iconImageUrl && !API_MEDIA_URL_RE.test(iconImageUrl) && !isLegacyAbsoluteUrl(iconImageUrl)) {
      return { ok: false, error: "Иконка должна быть выбрана из библиотеки файлов" };
    }

    const deps = buildAppDeps();
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

    const itemId = await deps.patientHomeBlocks.addItem({
      blockCode: input.blockCode,
      targetType: "content_section",
      targetRef: slug,
      isVisible: true,
    });

    revalidatePatientHomeSettings();
    return { ok: true, itemId, sectionSlug: slug };
  } catch (error) {
    const message = error instanceof Error ? error.message : "create_section_failed";
    return { ok: false, error: message };
  }
}

export async function listPatientHomeCandidates(blockCode: string): Promise<
  | { ok: true; items: Array<{ targetType: string; targetRef: string; title: string; subtitle: string | null; imageUrl: string | null }> }
  | { ok: false; error: string; items: [] }
> {
  try {
    await requireDoctorForPatientHomeBlocks();
    if (!isPatientHomeBlockCode(blockCode)) return { ok: false, error: "invalid_block_code", items: [] };
    const deps = buildAppDeps();
    const items = await deps.patientHomeBlocks.listCandidatesForBlock(blockCode);
    return { ok: true, items };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "list_candidates_failed", items: [] };
  }
}
