import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";
import { resolveFirstPendingProgramTabItemId } from "@/app/app/patient/home/resolveFirstPendingProgramTabItemId";
import { buildDailyWarmupPresentationSyncDeps } from "@/modules/patient-home/buildDailyWarmupPresentationSyncDeps";
import { buildPatientHomeWarmupPickContext } from "@/modules/patient-home/buildPatientHomeWarmupPickContext";
import { resolvePatientCanViewContent } from "@/app-layer/platform-access";
import {
  getPatientHomeTodayConfig,
  listDailyWarmupPagesForHome,
  resolveDailyWarmupPickIndex,
  type DailyWarmupListEntry,
  type DailyWarmupPickConsumer,
} from "@/modules/patient-home/todayConfig";
import { resolveActiveTreatmentProgramInstanceId } from "@/modules/treatment-program/patientTreatmentProgramEntry";
import { omitDisabledInstanceStageItemsForPatientApi } from "@/modules/treatment-program/stage-semantics";
import type { AppSession } from "@/shared/types/session";

type Deps = ReturnType<typeof buildAppDeps>;

function dailyWarmupContentHref(slug: string): string {
  return `/app/patient/content/${encodeURIComponent(slug)}?from=daily_warmup`;
}

async function canSessionOpenDailyWarmupSlug(deps: Deps, session: AppSession, slug: string): Promise<boolean> {
  const row = await deps.contentPages.getBySlug(slug);
  if (!row) return false;
  if (!row.requiresAuth) return true;
  return resolvePatientCanViewContent(session, slug, deps.entitlements);
}

async function resolveFirstAccessibleDailyWarmupPath(
  deps: Deps,
  session: AppSession,
  preferredSlug: string | null,
  orderedDailyWarmupPages: ReadonlyArray<Pick<DailyWarmupListEntry, "slug">>,
): Promise<string | null> {
  const candidates: string[] = [];
  if (preferredSlug) candidates.push(preferredSlug);
  for (const page of orderedDailyWarmupPages) {
    const slug = page.slug.trim();
    if (slug) candidates.push(slug);
  }
  const seen = new Set<string>();
  for (const slug of candidates) {
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    if (await canSessionOpenDailyWarmupSlug(deps, session, slug)) {
      return dailyWarmupContentHref(slug);
    }
  }
  return null;
}

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
  let preferredSlug: string | null = null;
  let orderedDailyWarmupPages: DailyWarmupListEntry[] | null = null;

  if (!personalTierOk) {
    const todayCfg = await getPatientHomeTodayConfig(homeDeps, { tier: "no_tier" });
    preferredSlug = todayCfg.dailyWarmupItem?.page?.slug?.trim() ?? null;
  } else {
    const warmupPick = buildPatientHomeWarmupPickContext(session.user.userId, deps);
    const presentationSyncDeps = buildDailyWarmupPresentationSyncDeps(deps);
    if (pickConsumer === "home") {
      const todayCfg = await getPatientHomeTodayConfig(homeDeps, warmupPick, presentationSyncDeps);
      preferredSlug = todayCfg.dailyWarmupItem?.page?.slug?.trim() ?? null;
    } else {
      orderedDailyWarmupPages = await listDailyWarmupPagesForHome(homeDeps);
      const pickIndex = await resolveDailyWarmupPickIndex(
        orderedDailyWarmupPages,
        warmupPick,
        "push_reminder",
        presentationSyncDeps,
      );
      preferredSlug = orderedDailyWarmupPages[pickIndex]?.slug?.trim() ?? null;
    }
  }

  const pages = orderedDailyWarmupPages ?? (await listDailyWarmupPagesForHome(homeDeps));
  const path = await resolveFirstAccessibleDailyWarmupPath(deps, session, preferredSlug, pages);
  return path ?? routePaths.patient;
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
