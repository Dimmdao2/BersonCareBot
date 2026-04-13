export type CompatSyncQuality = "full" | "partial" | "minimal";

export type CompatSyncQualityInput = {
  branchServiceId: string | null;
  cityCodeSnapshot: string | null;
  serviceTitleSnapshot: string | null;
  branchTitleSnapshot: string | null;
  rubitimeBranchId: string | null;
  rubitimeServiceId: string | null;
  slotEndExplicitFromWebhook: boolean;
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

  const hasTitleLikeMetadata = !!(
    input.branchTitleSnapshot ||
    input.serviceTitleSnapshot ||
    input.cityCodeSnapshot
  );
  if (hasTitleLikeMetadata) return "partial";
  return "minimal";
}
