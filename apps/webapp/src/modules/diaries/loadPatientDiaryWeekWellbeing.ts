import { DateTime } from "luxon";
import { resolveCalendarDayIanaForPatient } from "@/modules/system-settings/calendarIana";
import type { ReferencesPort } from "@/modules/references/ports";
import type { SymptomEntry } from "@/modules/diaries/types";
import { buildWarmupWeekImpactSummary, type WarmupWeekImpactSummary } from "./buildWarmupWeekImpactSummary";
import { buildWellbeingWeekChartData, type WellbeingWeekChartModel } from "./buildWellbeingWeekChartData";
import { formatPatientDiaryWeekRangeRu } from "./patientDiaryWeekRangeRu";
import { clampDiaryWeekStartNotAfterCurrent, mondayFromPatientDiaryWeekQuery } from "./parsePatientDiaryWeekQuery";
import { routePaths } from "@/app-layer/routes/paths";

/** Совпадает с {@link GENERAL_WELLBEING_SYMPTOM_KEY} в patient-mood (без импорта — избегаем цикла diaries ↔ patient-mood). */
const GENERAL_WELLBEING_SYMPTOM_KEY = "general_wellbeing";
const GENERAL_WELLBEING_TITLE = "Общее самочувствие";

const WARMUP_FEELING_CODE = "warmup_feeling";
const WARMUP_FEELING_TITLE_FALLBACK = "Самочувствие после разминки";

export type PatientDiaryWeekWellbeingDeps = {
  diaries: {
    ensureGeneralWellbeingTracking: (p: {
      userId: string;
      symptomTitle: string;
      symptomTypeRefId: string;
    }) => Promise<{ id: string }>;
    ensureWarmupFeelingTracking: (p: {
      userId: string;
      symptomTitle: string;
      symptomTypeRefId: string;
    }) => Promise<{ id: string }>;
    listSymptomEntriesForTrackingInRange: (p: {
      userId: string;
      trackingId: string;
      fromRecordedAt: string;
      toRecordedAtExclusive: string;
    }) => Promise<SymptomEntry[]>;
    minRecordedAtForSymptomTracking: (p: {
      userId: string;
      trackingId: string;
    }) => Promise<string | null>;
  };
  patientDiarySnapshots: { minLocalDateForUser: (platformUserId: string) => Promise<string | null> };
  references: ReferencesPort;
  patientCalendarTimezone: { getIanaForUser: (platformUserId: string) => Promise<string | null> };
  getAppDisplayTimeZone: () => Promise<string>;
};

export type PatientDiaryWeekNavModel = {
  weekRangeLabelRu: string;
  canGoPrev: boolean;
  canGoNext: boolean;
  prevHref: string | null;
  nextHref: string | null;
};

export type PatientDiaryWeekWellbeingLoadResult = {
  iana: string;
  chart: WellbeingWeekChartModel;
  hasAnyInstant: boolean;
  warmupImpactSummary: WarmupWeekImpactSummary;
  weekNav: PatientDiaryWeekNavModel;
};

function weekStartMsFromRecordedAtUtc(iso: string | null, iana: string): number | null {
  if (!iso) return null;
  const t = DateTime.fromISO(iso, { zone: "utc" }).setZone(iana);
  if (!t.isValid) return null;
  return t.startOf("week").toMillis();
}

function weekStartMsFromLocalYmd(ymd: string | null, iana: string): number | null {
  if (!ymd) return null;
  const t = DateTime.fromISO(ymd, { zone: iana });
  if (!t.isValid) return null;
  return t.startOf("week").toMillis();
}

async function symptomTypeRefId(references: ReferencesPort, code: string): Promise<{ id: string; title: string }> {
  const items = await references.listActiveItemsByCategoryCode("symptom_type");
  const item = items.find((i) => i.code === code);
  if (!item) throw new Error(`symptom_type_reference_missing:${code}`);
  return { id: item.id, title: item.title ?? code };
}

/**
 * Загружает записи general_wellbeing и warmup_feeling за выбранную календарную неделю (Пн–Вс) и строит модель графика.
 * {@link params.userId} — канонический `platform_users.id` (как в сессии).
 */
export async function loadPatientDiaryWeekWellbeing(
  deps: PatientDiaryWeekWellbeingDeps,
  params: { userId: string; week?: string },
): Promise<PatientDiaryWeekWellbeingLoadResult> {
  const appDefault = await deps.getAppDisplayTimeZone();
  const personal = await deps.patientCalendarTimezone.getIanaForUser(params.userId);
  const iana = resolveCalendarDayIanaForPatient(personal, appDefault);

  const [gwRef, wuRef] = await Promise.all([
    symptomTypeRefId(deps.references, GENERAL_WELLBEING_SYMPTOM_KEY),
    symptomTypeRefId(deps.references, WARMUP_FEELING_CODE),
  ]);

  const [gwTracking, wuTracking] = await Promise.all([
    deps.diaries.ensureGeneralWellbeingTracking({
      userId: params.userId,
      symptomTitle: GENERAL_WELLBEING_TITLE,
      symptomTypeRefId: gwRef.id,
    }),
    deps.diaries.ensureWarmupFeelingTracking({
      userId: params.userId,
      symptomTitle: wuRef.title || WARMUP_FEELING_TITLE_FALLBACK,
      symptomTypeRefId: wuRef.id,
    }),
  ]);

  const nowZ = DateTime.now().setZone(iana);
  const currentWeekStart = nowZ.startOf("week");

  const parsedMonday = mondayFromPatientDiaryWeekQuery(params.week, iana);
  const weekStart = clampDiaryWeekStartNotAfterCurrent(
    parsedMonday ?? currentWeekStart,
    nowZ,
  );
  const weekEnd = weekStart.plus({ weeks: 1 });
  const fromRecordedAt = weekStart.toUTC().toISO()!;
  const toRecordedAtExclusive = weekEnd.toUTC().toISO()!;

  const [generalEntries, warmupEntries, gwMinIso, wuMinIso, snapMinYmd] = await Promise.all([
    deps.diaries.listSymptomEntriesForTrackingInRange({
      userId: params.userId,
      trackingId: gwTracking.id,
      fromRecordedAt,
      toRecordedAtExclusive,
    }),
    deps.diaries.listSymptomEntriesForTrackingInRange({
      userId: params.userId,
      trackingId: wuTracking.id,
      fromRecordedAt,
      toRecordedAtExclusive,
    }),
    deps.diaries.minRecordedAtForSymptomTracking({ userId: params.userId, trackingId: gwTracking.id }),
    deps.diaries.minRecordedAtForSymptomTracking({ userId: params.userId, trackingId: wuTracking.id }),
    deps.patientDiarySnapshots.minLocalDateForUser(params.userId),
  ]);

  const chart = buildWellbeingWeekChartData(generalEntries, warmupEntries, iana, {
    weekStartMs: weekStart.toMillis(),
    weekEndMs: weekEnd.toMillis(),
  });
  const hasAnyInstant = chart.instantSeries.length > 0;
  const warmupImpactSummary = buildWarmupWeekImpactSummary(chart.instantSeries, chart.warmupScatter, iana);

  const currentWeekStartMs = currentWeekStart.toMillis();
  const selectedWeekStartMs = weekStart.toMillis();

  const boundCandidates = [
    weekStartMsFromRecordedAtUtc(gwMinIso, iana),
    weekStartMsFromRecordedAtUtc(wuMinIso, iana),
    weekStartMsFromLocalYmd(snapMinYmd, iana),
  ].filter((x): x is number => x != null && Number.isFinite(x));

  const earliestWeekStartMs =
    boundCandidates.length > 0 ? Math.min(...boundCandidates, currentWeekStartMs) : currentWeekStartMs;

  const canGoPrev = selectedWeekStartMs > earliestWeekStartMs;
  const canGoNext = selectedWeekStartMs < currentWeekStartMs;

  const prevMonday = weekStart.minus({ weeks: 1 });
  const nextMonday = weekStart.plus({ weeks: 1 });

  const prevHref =
    canGoPrev ? `${routePaths.diary}?week=${encodeURIComponent(prevMonday.toISODate()!)}` : null;

  let nextHref: string | null = null;
  if (canGoNext) {
    nextHref =
      nextMonday.toMillis() === currentWeekStartMs ?
        routePaths.diary
      : `${routePaths.diary}?week=${encodeURIComponent(nextMonday.toISODate()!)}`;
  }

  const weekNav: PatientDiaryWeekNavModel = {
    weekRangeLabelRu: formatPatientDiaryWeekRangeRu(weekStart, iana),
    canGoPrev,
    canGoNext,
    prevHref,
    nextHref,
  };

  return { iana, chart, hasAnyInstant, warmupImpactSummary, weekNav };
}
