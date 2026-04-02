/**
 * Compat-sync `compat_quality` (Rubitime projection → patient_bookings).
 * `full` requires real catalog `branch_service_id` + city + service title + resolved slot end (webhook or catalog duration).
 */
export type CompatSyncQuality = "full" | "partial" | "minimal";

export type CompatSyncQualityInput = {
  branchServiceId: string | null;
  cityCodeSnapshot: string | null;
  serviceTitleSnapshot: string | null;
  branchTitleSnapshot: string | null;
  rubitimeBranchId: string | null;
  rubitimeServiceId: string | null;
  /** True when Rubitime sent an explicit slot end (not defaulted in repo). */
  slotEndExplicitFromWebhook: boolean;
  /** True when slot end was computed from catalog `duration_minutes` after successful lookup. */
  slotEndFromCatalogDuration: boolean;
};

export function computeCompatSyncQuality(input: CompatSyncQualityInput): CompatSyncQuality {
  const hasResolvedSlotEnd = input.slotEndExplicitFromWebhook || input.slotEndFromCatalogDuration;
  const hasFull =
    !!input.branchServiceId &&
    !!input.cityCodeSnapshot &&
    !!input.serviceTitleSnapshot &&
    hasResolvedSlotEnd;
  if (hasFull) return "full";

  // Per DoD: `partial` = slot + rubitime_id + at least one human-facing title (not rubitime ids alone).
  const hasTitleLikeMetadata = !!(
    input.branchTitleSnapshot ||
    input.serviceTitleSnapshot ||
    input.cityCodeSnapshot
  );
  if (hasTitleLikeMetadata) return "partial";
  return "minimal";
}
