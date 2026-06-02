import { DateTime } from "luxon";
import { buildWellbeingWeekChartData } from "@/modules/diaries/buildWellbeingWeekChartData";
import type { SymptomEntry, SymptomTracking } from "@/modules/diaries/types";
import { WELLBEING_GENERAL_MIRROR_NOTE } from "@/modules/diaries/wellbeingGeneralMirrorNote";

const GENERAL_KEY = "general_wellbeing";
const WARMUP_KEY = "warmup_feeling";

function trackingIdsByKey(trackings: SymptomTracking[], key: string): Set<string> {
  return new Set(trackings.filter((t) => t.symptomKey === key).map((t) => t.id));
}

function filterEntries(entries: SymptomEntry[], trackingIds: Set<string>): SymptomEntry[] {
  if (trackingIds.size === 0) return [];
  return entries.filter(
    (e) =>
      trackingIds.has(e.trackingId) &&
      e.notes !== WELLBEING_GENERAL_MIRROR_NOTE,
  );
}

/** Модель спарклайна самочувствия для карточки врача из `ClientProfile`. */
export function buildDoctorClientWellbeingModel(
  trackings: SymptomTracking[],
  recentEntries: SymptomEntry[],
  iana: string,
) {
  const generalIds = trackingIdsByKey(trackings, GENERAL_KEY);
  const warmupIds = trackingIdsByKey(trackings, WARMUP_KEY);
  const anchor = DateTime.now().setZone(iana);
  const weekStart = anchor.startOf("week");
  const weekEnd = weekStart.plus({ weeks: 1 });
  return buildWellbeingWeekChartData(
    filterEntries(recentEntries, generalIds),
    filterEntries(recentEntries, warmupIds),
    iana,
    { weekStartMs: weekStart.toMillis(), weekEndMs: weekEnd.toMillis() },
  );
}
