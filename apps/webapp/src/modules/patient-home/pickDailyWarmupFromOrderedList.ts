/** Round-robin pick: next page after last completed, wrap, fallback index 0. */
export function pickDailyWarmupFromOrderedList(
  pages: ReadonlyArray<{ contentPageId: string }>,
  lastCompletedContentPageId: string | null,
): number {
  const n = pages.length;
  if (n === 0) return 0;
  if (!lastCompletedContentPageId) return 0;
  const idx = pages.findIndex((p) => p.contentPageId === lastCompletedContentPageId);
  if (idx < 0) return 0;
  return (idx + 1) % n;
}
