import type { TreatmentProgramInstanceDetail, TreatmentProgramInstanceStatus } from "@/modules/treatment-program/types";
import { confirmActiveProgramInstanceBatchSave } from "./programInstanceMutationGuard";
import {
  isInstanceEditorDraftFlushEmpty,
  pickInstanceEditorDraftFlushChanges,
  type InstanceEditorDraft,
} from "./instanceEditorDraft";

async function patchJson<T extends { ok?: boolean; error?: string }>(
  url: string,
  body: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as T | null;
  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error ?? "Ошибка сохранения" };
  }
  return { ok: true };
}

/** Сохранить накопленный черновик редактора одним проходом (один confirm для active). */
export async function flushInstanceEditorDraft(input: {
  instanceId: string;
  programStatus: TreatmentProgramInstanceStatus;
  draft: InstanceEditorDraft;
  baseline: TreatmentProgramInstanceDetail;
}): Promise<
  | { ok: true }
  | { ok: false; error: string; cancelled?: boolean; partial?: boolean }
> {
  const changes = pickInstanceEditorDraftFlushChanges(input.draft, input.baseline);
  if (isInstanceEditorDraftFlushEmpty(changes)) {
    return { ok: true };
  }

  if (!confirmActiveProgramInstanceBatchSave(input.programStatus)) {
    return { ok: false, error: "cancelled", cancelled: true };
  }

  const encInstance = encodeURIComponent(input.instanceId);
  let applied = 0;

  for (const [stageId, patch] of Object.entries(changes.stageMetadata)) {
    const body: Record<string, unknown> = {};
    if (patch.title !== undefined) body.title = patch.title;
    if (patch.description !== undefined) body.description = patch.description;
    if (patch.goals !== undefined) body.goals = patch.goals;
    if (patch.objectives !== undefined) body.objectives = patch.objectives;
    if (patch.expectedDurationDays !== undefined) body.expectedDurationDays = patch.expectedDurationDays;
    if (patch.expectedDurationText !== undefined) body.expectedDurationText = patch.expectedDurationText;
    const result = await patchJson(
      `/api/doctor/treatment-program-instances/${encInstance}/stages/${encodeURIComponent(stageId)}`,
      body,
    );
    if (!result.ok) return { ok: false, error: result.error, partial: applied > 0 };
    applied += 1;
  }

  for (const [groupId, patch] of Object.entries(changes.groupPatches)) {
    const body: Record<string, unknown> = {};
    if (patch.title !== undefined) body.title = patch.title;
    if (patch.description !== undefined) body.description = patch.description;
    if (patch.scheduleText !== undefined) body.scheduleText = patch.scheduleText;
    const result = await patchJson(
      `/api/doctor/treatment-program-instances/${encInstance}/stage-groups/${encodeURIComponent(groupId)}`,
      body,
    );
    if (!result.ok) return { ok: false, error: result.error, partial: applied > 0 };
    applied += 1;
  }

  for (const [itemId, patch] of Object.entries(changes.itemPatches)) {
    const body: Record<string, unknown> = {};
    if (patch.localComment !== undefined) body.localComment = patch.localComment;
    if (patch.loadSettings) body.loadSettings = patch.loadSettings;
    if (Object.keys(body).length === 0) continue;
    const result = await patchJson(
      `/api/doctor/treatment-program-instances/${encInstance}/stage-items/${encodeURIComponent(itemId)}`,
      body,
    );
    if (!result.ok) return { ok: false, error: result.error, partial: applied > 0 };
    applied += 1;
  }

  return { ok: true };
}
