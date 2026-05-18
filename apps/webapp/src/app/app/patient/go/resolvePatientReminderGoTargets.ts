import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";
import { resolveFirstPendingProgramTabItemId } from "@/app/app/patient/home/resolveFirstPendingProgramTabItemId";
import { getPatientHomeTodayConfig } from "@/modules/patient-home/todayConfig";
import {
  parsePatientHomeDailyWarmupRepeatCooldownMinutes,
  parsePatientHomeWarmupSkipToNextAvailableEnabled,
} from "@/modules/patient-home/patientHomeRepeatCooldownSettings";
import { pickActivePlanInstance } from "@/modules/treatment-program/pickActivePlanInstance";
import { omitDisabledInstanceStageItemsForPatientApi } from "@/modules/treatment-program/stage-semantics";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import type { AppSession } from "@/shared/types/session";
import { DateTime } from "luxon";

type Deps = ReturnType<typeof buildAppDeps>;

/**
 * Тот же целевой путь, что у CTA «Начать разминку» на главной (актуальная разминка дня).
 */
export async function resolveDailyWarmupStartPathForPatient(
  deps: Deps,
  session: AppSession,
  personalTierOk: boolean,
): Promise<string> {
  const appTz = await getAppDisplayTimeZone();
  const weekdayMonday0 = DateTime.now().setZone(appTz).weekday - 1;
  const [warmupRepeatSetting, warmupSkipSetting] = await Promise.all([
    deps.systemSettings.getSetting("patient_home_daily_warmup_repeat_cooldown_minutes", "admin"),
    deps.systemSettings.getSetting("patient_home_warmup_skip_to_next_available_enabled", "admin"),
  ]);
  const dailyWarmupRepeatCooldownMinutes = parsePatientHomeDailyWarmupRepeatCooldownMinutes(
    warmupRepeatSetting?.valueJson ?? null,
  );
  const warmupSkipCooldownPages = parsePatientHomeWarmupSkipToNextAvailableEnabled(
    warmupSkipSetting?.valueJson ?? null,
  );
  const warmupPick =
    personalTierOk ?
      {
        userId: session.user.userId,
        getDailyWarmupHeroCooldownMeta: deps.patientPractice.getDailyWarmupHeroCooldownMeta.bind(deps.patientPractice),
        cooldownMinutes: dailyWarmupRepeatCooldownMinutes,
        skipCooldownPages: warmupSkipCooldownPages,
      }
    : undefined;

  const todayCfg = await getPatientHomeTodayConfig(
    {
      patientHomeBlocks: deps.patientHomeBlocks,
      contentPages: deps.contentPages,
      contentSections: deps.contentSections,
      systemSettings: deps.systemSettings,
    },
    weekdayMonday0,
    warmupPick,
  );
  const slug = todayCfg.dailyWarmupItem?.page?.slug?.trim();
  if (!slug) return routePaths.patient;
  return `/app/patient/content/${encodeURIComponent(slug)}?from=daily_warmup`;
}

/**
 * Тот же целевой путь, что у «Начать занятие» на карточке плана главной и в hero программы.
 */
export async function resolvePlanStartLessonPathForPatient(deps: Deps, userId: string): Promise<string> {
  const instances = await deps.treatmentProgramInstance.listForPatient(userId);
  const picked = pickActivePlanInstance(instances);
  if (!picked) {
    const promoId = await deps.systemSettings.getPatientDefaultPromoTreatmentProgramTemplateId();
    if (promoId) {
      try {
        const tpl = await deps.treatmentProgram.getTemplate(promoId);
        if (tpl.status === "published") return routePaths.patientTreatmentPromoDefault;
      } catch {
        /* fall through */
      }
    }
    return routePaths.patientTreatmentPrograms;
  }
  let href = routePaths.patientTreatmentProgram(picked.id);
  const rawDetail = await deps.treatmentProgramInstance.getInstanceForPatient(userId, picked.id);
  if (!rawDetail) return href;
  const detail = omitDisabledInstanceStageItemsForPatientApi(rawDetail);
  const snap = await deps.treatmentProgramPatientActions.listChecklistDoneToday(userId, picked.id);
  const firstItemId = resolveFirstPendingProgramTabItemId(detail, snap.doneItemIds);
  if (firstItemId) {
    href = routePaths.patientTreatmentProgramItem(picked.id, firstItemId, "exec", "program");
  }
  return href;
}
