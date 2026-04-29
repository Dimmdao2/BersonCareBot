"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { canAccessDoctor } from "@/modules/roles/service";
import { isPatientHomeBlockCode } from "@/modules/patient-home/blocks";
import type { PatientHomeBlockItemTargetType } from "@/modules/patient-home/ports";

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
