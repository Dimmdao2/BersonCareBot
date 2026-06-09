import {
  syncDailyWarmupScheduledRotation,
  type SyncDailyWarmupScheduledRotationDeps,
} from "@/modules/patient-home/syncDailyWarmupScheduledRotation";
import { listDailyWarmupPagesForHome } from "@/modules/patient-home/todayConfig";
import { pickDailyWarmupFromOrderedList } from "@/modules/patient-home/pickDailyWarmupFromOrderedList";

export type { SyncDailyWarmupScheduledRotationDeps as DailyWarmupPresentationSyncDeps };

/** Lazy sync scheduled rotation; returns current `content_page_id` for pick. */
export async function ensureDailyWarmupPresentationSynced(
  userId: string,
  deps: SyncDailyWarmupScheduledRotationDeps,
  now: Date = new Date(),
): Promise<string | null> {
  const pages = await listDailyWarmupPagesForHome(deps);
  if (pages.length === 0) return null;

  const state = await syncDailyWarmupScheduledRotation(userId, pages, deps, now);
  if (state) return state.contentPageId;

  const lastCompleted = await deps.patientPractice.getLatestDailyWarmupCompletedContentPageId(userId);
  const idx = pickDailyWarmupFromOrderedList(pages, lastCompleted);
  return pages[idx]?.contentPageId ?? pages[0]?.contentPageId ?? null;
}
