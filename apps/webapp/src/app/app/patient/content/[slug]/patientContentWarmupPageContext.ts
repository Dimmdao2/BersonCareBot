import { routePaths } from "@/app-layer/routes/paths";
import {
  buildPatientDailyWarmupNav,
  type DailyWarmupListEntry,
  type PatientDailyWarmupNav,
} from "@/modules/patient-home/todayConfig";

export type ContentPagePracticeSource = "daily_warmup" | "section_page";

export function resolveIsDailyWarmupMember(
  slug: string,
  orderedDailyWarmupPages: ReadonlyArray<{ slug: string }>,
): boolean {
  return orderedDailyWarmupPages.some((p) => p.slug === slug);
}

export function resolvePatientContentBackNav(params: {
  isDailyWarmupMember: boolean;
  fromDailyWarmup: boolean;
  sectionSlug: string;
}): { backHref: string; backLabel: string; showBackToSectionRow: boolean } {
  const sectionSlug = params.sectionSlug.trim();
  if (params.isDailyWarmupMember && params.fromDailyWarmup) {
    return { backHref: routePaths.patient, backLabel: "Меню", showBackToSectionRow: false };
  }
  if (params.isDailyWarmupMember) {
    return {
      backHref: sectionSlug ? `/app/patient/sections/${encodeURIComponent(sectionSlug)}` : routePaths.patient,
      backLabel: sectionSlug ? "Назад к разделу" : "Меню",
      showBackToSectionRow: false,
    };
  }
  return {
    backHref: sectionSlug ? `/app/patient/sections/${encodeURIComponent(sectionSlug)}` : routePaths.patient,
    backLabel: sectionSlug ? "Назад к разделу" : "Меню",
    showBackToSectionRow: Boolean(sectionSlug),
  };
}

export type PatientContentWarmupPageContext = {
  isDailyWarmupMember: boolean;
  practiceSource: ContentPagePracticeSource;
  warmupNav: PatientDailyWarmupNav | null;
  backNav: ReturnType<typeof resolvePatientContentBackNav>;
};

/** Контракт page.tsx: membership задаёт layout/practiceSource; query `from` — только back. */
export function resolvePatientContentWarmupPageContext(params: {
  slug: string;
  fromDailyWarmup: boolean;
  sectionSlug: string;
  orderedDailyWarmupPages: ReadonlyArray<Pick<DailyWarmupListEntry, "slug">>;
}): PatientContentWarmupPageContext {
  const isDailyWarmupMember = resolveIsDailyWarmupMember(params.slug, params.orderedDailyWarmupPages);
  return {
    isDailyWarmupMember,
    practiceSource: isDailyWarmupMember ? "daily_warmup" : "section_page",
    warmupNav:
      isDailyWarmupMember ? buildPatientDailyWarmupNav(params.slug, params.orderedDailyWarmupPages) : null,
    backNav: resolvePatientContentBackNav({
      isDailyWarmupMember,
      fromDailyWarmup: params.fromDailyWarmup,
      sectionSlug: params.sectionSlug,
    }),
  };
}
