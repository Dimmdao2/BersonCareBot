"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { isPatientHomeBlockCode } from "@/modules/patient-home/blocks";
import type { PatientHomeBlockItemTargetType } from "@/modules/patient-home/ports";

const targetTypeSchema = z.enum(["content_page", "content_section", "course", "static_action"]);

type ActionState = { ok: true } | { ok: false; error: string };

function fail(error: string): ActionState {
  return { ok: false, error };
}

async function requireAdmin(): Promise<void> {
  const session = await getCurrentSession();
  if (!session || session.user.role !== "admin") {
    throw new Error("forbidden");
  }
}

function revalidatePatientHomeSettings(): void {
  revalidatePath("/app/settings/patient-home");
  revalidatePath("/app/patient");
}

export async function togglePatientHomeBlockVisibility(
  code: string,
  visible: boolean,
): Promise<ActionState> {
  try {
    await requireAdmin();
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
    await requireAdmin();
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
    await requireAdmin();
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
    await requireAdmin();
    const deps = buildAppDeps();
    await deps.patientHomeBlocks.updateItem(itemId, { isVisible: visible });
    revalidatePatientHomeSettings();
    return { ok: true };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "update_item_failed");
  }
}

export async function deletePatientHomeItem(itemId: string): Promise<ActionState> {
  try {
    await requireAdmin();
    const deps = buildAppDeps();
    await deps.patientHomeBlocks.deleteItem(itemId);
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
    await requireAdmin();
    if (!isPatientHomeBlockCode(blockCode)) return fail("invalid_block_code");
    const deps = buildAppDeps();
    await deps.patientHomeBlocks.reorderItems(blockCode, orderedItemIds);
    revalidatePatientHomeSettings();
    return { ok: true };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "reorder_items_failed");
  }
}

export async function listPatientHomeCandidates(blockCode: string): Promise<
  | { ok: true; items: Array<{ targetType: string; targetRef: string; title: string; subtitle: string | null; imageUrl: string | null }> }
  | { ok: false; error: string; items: [] }
> {
  try {
    await requireAdmin();
    if (!isPatientHomeBlockCode(blockCode)) return { ok: false, error: "invalid_block_code", items: [] };
    const deps = buildAppDeps();
    const items = await deps.patientHomeBlocks.listCandidatesForBlock(blockCode);
    return { ok: true, items };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "list_candidates_failed", items: [] };
  }
}
