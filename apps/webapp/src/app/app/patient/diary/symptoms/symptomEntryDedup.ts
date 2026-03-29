/** Окно дедупликации «в моменте» (EXEC I.6). */
export const SYMPTOM_INSTANT_DEDUP_MS = 2 * 60 * 1000;

export type LastSymptomSaveMeta = {
  trackingId: string;
  entryType: "instant" | "daily";
  at: number;
};

export type ExistingSymptomEntryMeta = {
  entryType: "instant" | "daily";
  value0_10: number;
  notes: string | null;
  recordedAt: string;
};

export function shouldConfirmInstantDuplicate(
  last: LastSymptomSaveMeta | null,
  trackingId: string,
  entryType: "instant" | "daily",
): boolean {
  if (!last) return false;
  if (entryType !== "instant" || last.entryType !== "instant") return false;
  if (last.trackingId !== trackingId) return false;
  return Date.now() - last.at < SYMPTOM_INSTANT_DEDUP_MS;
}

function normalizeNotes(notes: string | null): string {
  return (notes ?? "").trim();
}

export function hasInstantDuplicateInWindow(
  entries: ExistingSymptomEntryMeta[],
  params: {
    recordedAtMs: number;
    value0_10: number;
    notes: string | null;
    dedupWindowMs?: number;
  },
): boolean {
  const dedupWindowMs = params.dedupWindowMs ?? SYMPTOM_INSTANT_DEDUP_MS;
  const targetNotes = normalizeNotes(params.notes);
  return entries.some((entry) => {
    if (entry.entryType !== "instant") return false;
    if (entry.value0_10 !== params.value0_10) return false;
    if (normalizeNotes(entry.notes) !== targetNotes) return false;
    const ts = new Date(entry.recordedAt).getTime();
    if (Number.isNaN(ts)) return false;
    return Math.abs(params.recordedAtMs - ts) < dedupWindowMs;
  });
}

export function getUtcDayRange(recordedAtMs: number): {
  fromRecordedAt: string;
  toRecordedAtExclusive: string;
} {
  const at = new Date(recordedAtMs);
  const from = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), 0, 0, 0, 0),
  );
  const to = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() + 1, 0, 0, 0, 0),
  );
  return {
    fromRecordedAt: from.toISOString(),
    toRecordedAtExclusive: to.toISOString(),
  };
}
