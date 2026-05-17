import type { WarmupScatterPoint, WellbeingWeekPoint } from "@/modules/diaries/buildWellbeingWeekChartData";

/** Максимум времени от ближайшей общей instant-отметки до разминки (мс), чтобы связать пару «до разминки / сразу после». */
const PAIR_WINDOW_MS = 24 * 60 * 60 * 1000;

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

function findInstantBefore(sorted: WellbeingWeekPoint[], tw: number): WellbeingWeekPoint | null {
  let best: WellbeingWeekPoint | null = null;
  for (const p of sorted) {
    if (p.t >= tw) break;
    if (tw - p.t <= PAIR_WINDOW_MS) best = p;
  }
  return best;
}

/**
 * Влияние разминок за неделю: для каждой отметки «после разминки» ({@link warmupScatter}) ищем ближайшую
 * общую instant-оценку строго до неё в окне {@link PAIR_WINDOW_MS}; Δ = оценка после разминки − общая до.
 */
export function buildWarmupWeekImpactSummary(
  instantSeries: WellbeingWeekPoint[],
  warmupScatter: WarmupScatterPoint[],
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
    const before = findInstantBefore(instant, w.t);
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
