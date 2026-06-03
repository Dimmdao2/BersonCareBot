import type { TreatmentProgramInstanceDetail, TreatmentProgramInstanceStatus } from "@/modules/treatment-program/types";
import { confirmActiveProgramInstanceBatchSave } from "./programInstanceMutationGuard";
import {
  isInstanceEditorDraftDirty,
  normalizeInstanceEditorDraft,
  type InstanceEditorDraft,
} from "./instanceEditorDraft";

/** Сохранить накопленный черновик редактора одним POST editor-batch. */
export async function flushInstanceEditorDraft(input: {
  instanceId: string;
  programStatus: TreatmentProgramInstanceStatus;
  draft: InstanceEditorDraft;
  baseline: TreatmentProgramInstanceDetail;
}): Promise<{ ok: true } | { ok: false; error: string; cancelled?: boolean }> {
  const normalized = normalizeInstanceEditorDraft(input.draft, input.baseline);
  if (!isInstanceEditorDraftDirty(normalized, input.baseline)) {
    return { ok: true };
  }

  if (!confirmActiveProgramInstanceBatchSave(input.programStatus)) {
    return { ok: false, error: "cancelled", cancelled: true };
  }

  const encInstance = encodeURIComponent(input.instanceId);
  const res = await fetch(`/api/doctor/treatment-program-instances/${encInstance}/editor-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draft: normalized }),
  });
  const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error ?? "Ошибка сохранения" };
  }
  return { ok: true };
}
