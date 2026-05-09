import type { WarmupScatterPoint, WellbeingWeekPoint } from "@/modules/diaries/buildWellbeingWeekChartData";

/** Максимум времени от разминки до ближайшей отметки самочувствия (мс), чтобы связать пару «до / после». */
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
  /** Среднее (v_after − v_before) по успешным парам; иначе null. */
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

function findInstantAfter(sorted: WellbeingWeekPoint[], tw: number): WellbeingWeekPoint | null {
  for (const p of sorted) {
    if (p.t <= tw) continue;
    if (p.t - tw <= PAIR_WINDOW_MS) return p;
  }
  return null;
}

/**
 * Оценка влияния разминок на неделе: для каждой отметки после разминки ищем ближайшие instant-самочувствия
 * строго до и строго после неё в окне {@link PAIR_WINDOW_MS}; среднее изменение по шкале 1–5.
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
    const after = findInstantAfter(instant, w.t);
    if (!before || !after) continue;
    deltas.push(after.v - before.v);
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
