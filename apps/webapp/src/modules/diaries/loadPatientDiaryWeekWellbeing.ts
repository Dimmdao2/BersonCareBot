import { DateTime } from "luxon";
import { resolveCalendarDayIanaForPatient } from "@/modules/system-settings/calendarIana";
import type { ReferencesPort } from "@/modules/references/ports";
import type { SymptomEntry } from "@/modules/diaries/types";
import { buildWarmupWeekImpactSummary, type WarmupWeekImpactSummary } from "./buildWarmupWeekImpactSummary";
import { buildWellbeingWeekChartData, type WellbeingWeekChartModel } from "./buildWellbeingWeekChartData";

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
  };
  references: ReferencesPort;
  patientCalendarTimezone: { getIanaForUser: (platformUserId: string) => Promise<string | null> };
  getAppDisplayTimeZone: () => Promise<string>;
};

export type PatientDiaryWeekWellbeingLoadResult = {
  iana: string;
  chart: WellbeingWeekChartModel;
  hasAnyInstant: boolean;
  warmupImpactSummary: WarmupWeekImpactSummary;
};

async function symptomTypeRefId(references: ReferencesPort, code: string): Promise<{ id: string; title: string }> {
  const items = await references.listActiveItemsByCategoryCode("symptom_type");
  const item = items.find((i) => i.code === code);
  if (!item) throw new Error(`symptom_type_reference_missing:${code}`);
  return { id: item.id, title: item.title ?? code };
}

/**
 * Загружает записи general_wellbeing и warmup_feeling за текущую календарную неделю (Пн–Вс) и строит модель графика.
 * {@link params.userId} — канонический `platform_users.id` (как в сессии).
 */
export async function loadPatientDiaryWeekWellbeing(
  deps: PatientDiaryWeekWellbeingDeps,
  params: { userId: string },
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

  const weekStart = DateTime.now().setZone(iana).startOf("week");
  const weekEnd = weekStart.plus({ weeks: 1 });
  const fromRecordedAt = weekStart.toUTC().toISO()!;
  const toRecordedAtExclusive = weekEnd.toUTC().toISO()!;

  const [generalEntries, warmupEntries] = await Promise.all([
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
  ]);

  const chart = buildWellbeingWeekChartData(generalEntries, warmupEntries, iana, {
    weekStartMs: weekStart.toMillis(),
    weekEndMs: weekEnd.toMillis(),
  });
  const hasAnyInstant = chart.instantSeries.length > 0;
  const warmupImpactSummary = buildWarmupWeekImpactSummary(chart.instantSeries, chart.warmupScatter);

  return { iana, chart, hasAnyInstant, warmupImpactSummary };
}
