import type { AppendTreatmentProgramEventInput, TreatmentProgramEventType } from "./types";

/** §8: `reason` обязателен для `stage_skipped` и `item_removed`. */
export function normalizeEventReason(
  eventType: TreatmentProgramEventType,
  reason: string | null | undefined,
): string | null {
  if (eventType === "stage_skipped" || eventType === "item_removed") {
    const r = reason?.trim();
    if (!r) {
      throw new Error(
        eventType === "stage_skipped"
          ? "Для пропуска этапа укажите причину"
          : "Для удаления элемента укажите причину",
      );
    }
    return r;
  }
  const t = reason?.trim();
  return t || null;
}

export function buildAppendEventInput(
  base: Omit<AppendTreatmentProgramEventInput, "reason"> & { reason?: string | null },
): AppendTreatmentProgramEventInput {
  return {
    ...base,
    payload: base.payload ?? {},
    reason: normalizeEventReason(base.eventType, base.reason),
  };
}
