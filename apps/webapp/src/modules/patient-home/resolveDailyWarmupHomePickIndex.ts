import { pickDailyWarmupFromOrderedList } from "@/modules/patient-home/pickDailyWarmupFromOrderedList";

/** Индекс разминки на главной: presented → иначе следующая после последней выполненной → первая. */
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
    return pickDailyWarmupFromOrderedList(pages, lastCompletedContentPageId);
  }
  return 0;
}
