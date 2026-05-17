import { DateTime } from "luxon";
import type { WarmupScatterPoint, WellbeingWeekPoint } from "@/modules/diaries/buildWellbeingWeekChartData";

/** Порог для класса «улучшение / ухудшение» по среднему Δ на шкале 1–5. */
const TREND_EPS = 0.08;

export type WarmupWeekImpactKind =
  | "no_warmups"
  | "insufficient_pairs"
  | "improved"
  | "neutral"
  | "worse";

export type WarmupWeekImpactSummary = {
  kind: WarmupWeekImpactKind;
  /** Среднее (оценка сразу после разминки − общая instant до разминки) по успешным парам; иначе null. */
  avgDelta: number | null;
  pairedCount: number;
  warmupCount: number;
};

function localDayKey(ms: number, iana: string): string | null {
  return DateTime.fromMillis(ms, { zone: iana }).toISODate();
}

/** Последняя общая instant-оценка в тот же календарный день (IANA), строго до момента разминки. */
function findInstantBeforeSameLocalDay(
  sorted: WellbeingWeekPoint[],
  warmupAtMs: number,
  iana: string,
): WellbeingWeekPoint | null {
  const warmupDay = localDayKey(warmupAtMs, iana);
  if (!warmupDay) return null;
  let best: WellbeingWeekPoint | null = null;
  for (const p of sorted) {
    if (p.t >= warmupAtMs) break;
    if (localDayKey(p.t, iana) !== warmupDay) continue;
    best = p;
  }
  return best;
}

/**
 * Влияние разминок за неделю: для каждой отметки «после разминки» ({@link warmupScatter}) ищем последнюю
 * общую instant-оценку в тот же календарный день ({@link iana}), строго до неё; Δ = после − до.
 */
export function buildWarmupWeekImpactSummary(
  instantSeries: WellbeingWeekPoint[],
  warmupScatter: WarmupScatterPoint[],
  iana: string,
): WarmupWeekImpactSummary {
  const warmupCount = warmupScatter.length;
  if (warmupCount === 0) {
    return { kind: "no_warmups", avgDelta: null, pairedCount: 0, warmupCount: 0 };
  }

  const instant = [...instantSeries].sort((a, b) => a.t - b.t);
  if (instant.length === 0) {
    return { kind: "insufficient_pairs", avgDelta: null, pairedCount: 0, warmupCount };
  }

  const deltas: number[] = [];
  for (const w of warmupScatter) {
    const before = findInstantBeforeSameLocalDay(instant, w.t, iana);
    if (!before) continue;
    deltas.push(w.v - before.v);
  }

  const pairedCount = deltas.length;
  if (pairedCount === 0) {
    return { kind: "insufficient_pairs", avgDelta: null, pairedCount: 0, warmupCount };
  }

  const avgDelta = deltas.reduce((a, b) => a + b, 0) / pairedCount;

  if (avgDelta > TREND_EPS) {
    return { kind: "improved", avgDelta, pairedCount, warmupCount };
  }
  if (avgDelta < -TREND_EPS) {
    return { kind: "worse", avgDelta, pairedCount, warmupCount };
  }
  return { kind: "neutral", avgDelta, pairedCount, warmupCount };
}
