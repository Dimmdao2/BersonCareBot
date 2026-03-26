/** Окно дедупликации «в моменте» (EXEC I.6). */
export const SYMPTOM_INSTANT_DEDUP_MS = 2 * 60 * 1000;

export type LastSymptomSaveMeta = {
  trackingId: string;
  entryType: "instant" | "daily";
  at: number;
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
