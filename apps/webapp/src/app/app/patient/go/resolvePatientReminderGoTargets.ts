import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";
import { resolveFirstPendingProgramTabItemId } from "@/app/app/patient/home/resolveFirstPendingProgramTabItemId";
import { buildPatientHomeWarmupPickContext } from "@/modules/patient-home/buildPatientHomeWarmupPickContext";
import {
  getPatientHomeTodayConfig,
  listDailyWarmupPagesForHome,
  resolveDailyWarmupPickIndex,
  type DailyWarmupPickConsumer,
} from "@/modules/patient-home/todayConfig";
import { resolveActiveTreatmentProgramInstanceId } from "@/modules/treatment-program/patientTreatmentProgramEntry";
import { omitDisabledInstanceStageItemsForPatientApi } from "@/modules/treatment-program/stage-semantics";
import type { AppSession } from "@/shared/types/session";

type Deps = ReturnType<typeof buildAppDeps>;

/**
 * Тот же целевой путь, что у CTA «Начать разминку» на главной (актуальная разминка дня).
 */
export async function resolveDailyWarmupStartPathForPatient(
  deps: Deps,
  session: AppSession,
  personalTierOk: boolean,
  pickConsumer: DailyWarmupPickConsumer = "home",
): Promise<string> {
  const homeDeps = {
    patientHomeBlocks: deps.patientHomeBlocks,
    contentPages: deps.contentPages,
    contentSections: deps.contentSections,
    systemSettings: deps.systemSettings,
  };

  if (!personalTierOk) {
    const todayCfg = await getPatientHomeTodayConfig(homeDeps, { tier: "no_tier" });
    const slug = todayCfg.dailyWarmupItem?.page?.slug?.trim();
    if (!slug) return routePaths.patient;
    return `/app/patient/content/${encodeURIComponent(slug)}?from=daily_warmup`;
  }

  const warmupPick = buildPatientHomeWarmupPickContext(session.user.userId, deps);
  if (pickConsumer === "home") {
    const todayCfg = await getPatientHomeTodayConfig(homeDeps, warmupPick);
    const slug = todayCfg.dailyWarmupItem?.page?.slug?.trim();
    if (!slug) return routePaths.patient;
    return `/app/patient/content/${encodeURIComponent(slug)}?from=daily_warmup`;
  }

  const pages = await listDailyWarmupPagesForHome(homeDeps);
  const pickIndex = await resolveDailyWarmupPickIndex(pages, warmupPick, "push_reminder");
  const slug = pages[pickIndex]?.slug?.trim();
  if (!slug) return routePaths.patient;
  return `/app/patient/content/${encodeURIComponent(slug)}?from=daily_warmup`;
}

/**
 * Тот же целевой путь, что у «Начать занятие» на карточке плана главной и в hero программы.
 */
export async function resolvePlanStartLessonPathForPatient(deps: Deps, userId: string): Promise<string> {
  const instanceId = await resolveActiveTreatmentProgramInstanceId(deps, userId);
  if (!instanceId) return routePaths.patientTreatmentPrograms;

  let href = routePaths.patientTreatmentProgram(instanceId);
  const rawDetail = await deps.treatmentProgramInstance.getInstanceForPatient(userId, instanceId);
  if (!rawDetail) return href;
  const detail = omitDisabledInstanceStageItemsForPatientApi(rawDetail);
  const snap = await deps.treatmentProgramPatientActions.listChecklistDoneToday(userId, instanceId);
  const firstItemId = resolveFirstPendingProgramTabItemId(detail, snap.doneItemIds);
  if (firstItemId) {
    href = routePaths.patientTreatmentProgramItem(instanceId, firstItemId, "exec", "program");
  }
  return href;
}
