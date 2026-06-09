import type { SyncDailyWarmupScheduledRotationDeps } from "@/modules/patient-home/syncDailyWarmupScheduledRotation";
import { ensureDailyWarmupPresentationSynced } from "@/modules/patient-home/ensureDailyWarmupPresentationSynced";
import { listDailyWarmupPagesForHome } from "@/modules/patient-home/todayConfig";
import { pickDailyWarmupFromOrderedList } from "@/modules/patient-home/pickDailyWarmupFromOrderedList";

export type AdvanceDailyWarmupPresentationManuallyResult =
  | { advanced: true; nextContentPageId: string }
  | { advanced: false; reason: "not_current_presented" | "no_pages" };

/**
 * Manual advance после видео или completion: только если anchor === текущая presented.
 * Ставит skip одной следующей scheduled-смены.
 */
export async function advanceDailyWarmupPresentationManually(
  userId: string,
  anchorContentPageId: string,
  deps: SyncDailyWarmupScheduledRotationDeps,
  now: Date = new Date(),
): Promise<AdvanceDailyWarmupPresentationManuallyResult> {
  const pages = await listDailyWarmupPagesForHome(deps);
  if (pages.length === 0) {
    return { advanced: false, reason: "no_pages" };
  }

  const presentedId = await ensureDailyWarmupPresentationSynced(userId, deps, now);
  if (!presentedId || presentedId !== anchorContentPageId) {
    return { advanced: false, reason: "not_current_presented" };
  }

  const nextIndex = pickDailyWarmupFromOrderedList(pages, anchorContentPageId);
  const nextContentPageId = pages[nextIndex]?.contentPageId;
  if (!nextContentPageId) {
    return { advanced: false, reason: "no_pages" };
  }

  const nowIso = now.toISOString();
  await deps.patientDailyWarmupPresentation.upsertPresentationState(userId, {
    contentPageId: nextContentPageId,
    lastRotationAt: nowIso,
    skipNextScheduledRotation: true,
  });

  return { advanced: true, nextContentPageId };
}
