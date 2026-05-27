import { advanceDailyWarmupPresentationAfterVideoView } from "@/modules/patient-home/advanceDailyWarmupPresentationAfterVideoView";
import {
  isContentPageInDailyWarmupBlock,
  listDailyWarmupPagesForHome,
  type PatientHomeTodayConfigDeps,
} from "@/modules/patient-home/todayConfig";
import type { PatientDailyWarmupPresentationPort } from "@/modules/patient-home/dailyWarmupPresentationPorts";

export type RecordDailyWarmupVideoViewDeps = PatientHomeTodayConfigDeps & {
  patientDailyWarmupPresentation: PatientDailyWarmupPresentationPort;
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

  const pages = await listDailyWarmupPagesForHome(deps);
  await advanceDailyWarmupPresentationAfterVideoView(userId, contentPageId, pages, {
    setPresentedContentPageId: deps.patientDailyWarmupPresentation.setPresentedContentPageId.bind(
      deps.patientDailyWarmupPresentation,
    ),
  });

  return { ok: true };
}
