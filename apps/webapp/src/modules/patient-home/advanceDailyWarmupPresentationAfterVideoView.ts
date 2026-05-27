import { pickDailyWarmupFromOrderedList } from "@/modules/patient-home/pickDailyWarmupFromOrderedList";

export type AdvanceDailyWarmupPresentationAfterVideoViewDeps = {
  setPresentedContentPageId(userId: string, contentPageId: string): Promise<void>;
};

/**
 * После просмотра видео разминки: на главной и в следующем push — следующая страница после просмотренной.
 */
export async function advanceDailyWarmupPresentationAfterVideoView(
  userId: string,
  viewedContentPageId: string,
  pages: ReadonlyArray<{ contentPageId: string }>,
  deps: AdvanceDailyWarmupPresentationAfterVideoViewDeps,
): Promise<void> {
  if (pages.length === 0) return;
  const nextIndex = pickDailyWarmupFromOrderedList(pages, viewedContentPageId);
  const nextContentPageId = pages[nextIndex]?.contentPageId;
  if (!nextContentPageId) return;
  await deps.setPresentedContentPageId(userId, nextContentPageId);
}
