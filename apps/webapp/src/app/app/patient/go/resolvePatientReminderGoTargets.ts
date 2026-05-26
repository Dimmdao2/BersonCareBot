import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";
import { resolveFirstPendingProgramTabItemId } from "@/app/app/patient/home/resolveFirstPendingProgramTabItemId";
import { getPatientHomeTodayConfig } from "@/modules/patient-home/todayConfig";
import { pickActivePlanInstance } from "@/modules/treatment-program/pickActivePlanInstance";
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
): Promise<string> {
  const warmupPick =
    personalTierOk ?
      {
        tier: "patient" as const,
        userId: session.user.userId,
        getLatestCompletedContentPageId: deps.patientPractice.getLatestDailyWarmupCompletedContentPageId.bind(
          deps.patientPractice,
        ),
      }
    : { tier: "no_tier" as const };

  const todayCfg = await getPatientHomeTodayConfig(
    {
      patientHomeBlocks: deps.patientHomeBlocks,
      contentPages: deps.contentPages,
      contentSections: deps.contentSections,
      systemSettings: deps.systemSettings,
    },
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
  let instances = await deps.treatmentProgramInstance.listForPatient(userId);
  let picked = pickActivePlanInstance(instances);
  if (!picked) {
    const promoId = await deps.systemSettings.getPatientDefaultPromoTreatmentProgramTemplateId();
    if (promoId) {
      try {
        const tpl = await deps.treatmentProgram.getTemplate(promoId);
        if (tpl.status === "published") {
          await deps.treatmentProgramInstance.ensureDefaultPromoProgramForPatient({ patientUserId: userId });
          instances = await deps.treatmentProgramInstance.listForPatient(userId);
          picked = pickActivePlanInstance(instances);
        }
      } catch {
        /* fall through */
      }
    }
    if (!picked) return routePaths.patientTreatmentPrograms;
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
