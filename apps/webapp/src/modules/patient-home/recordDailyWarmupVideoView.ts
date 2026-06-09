import { advanceDailyWarmupPresentationManually } from "@/modules/patient-home/advanceDailyWarmupPresentationManually";
import type { SyncDailyWarmupScheduledRotationDeps } from "@/modules/patient-home/syncDailyWarmupScheduledRotation";
import {
  isContentPageInDailyWarmupBlock,
  type PatientHomeTodayConfigDeps,
} from "@/modules/patient-home/todayConfig";
import type { PatientDailyWarmupVideoViewPort } from "@/modules/patient-home/dailyWarmupVideoViewPorts";

export type RecordDailyWarmupVideoViewDeps = PatientHomeTodayConfigDeps &
  SyncDailyWarmupScheduledRotationDeps & {
    patientDailyWarmupVideoViews: PatientDailyWarmupVideoViewPort;
  };

export async function recordDailyWarmupVideoView(
  userId: string,
  contentPageId: string,
  deps: RecordDailyWarmupVideoViewDeps,
): Promise<{ ok: true } | { ok: false; error: "not_daily_warmup" }> {
  const inBlock = await isContentPageInDailyWarmupBlock(contentPageId, deps);
  if (!inBlock) {
    return { ok: false, error: "not_daily_warmup" };
  }

  await deps.patientDailyWarmupVideoViews.recordView(userId, contentPageId);
  await advanceDailyWarmupPresentationManually(userId, contentPageId, deps);

  return { ok: true };
}
