/** Индекс разминки на главной: presented → иначе последняя выполненная (не «следующая») → первая. */
export function resolveDailyWarmupHomePickIndex(
  pages: ReadonlyArray<{ contentPageId: string }>,
  presentedContentPageId: string | null,
  lastCompletedContentPageId: string | null,
): number {
  const n = pages.length;
  if (n === 0) return 0;
  if (presentedContentPageId) {
    const presentedIdx = pages.findIndex((p) => p.contentPageId === presentedContentPageId);
    if (presentedIdx >= 0) return presentedIdx;
  }
  if (lastCompletedContentPageId) {
    const completedIdx = pages.findIndex((p) => p.contentPageId === lastCompletedContentPageId);
    if (completedIdx >= 0) return completedIdx;
  }
  return 0;
}
