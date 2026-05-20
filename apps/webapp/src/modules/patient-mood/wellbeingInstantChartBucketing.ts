/** Минимальный шаг линии «в течение дня» на графиках самочувствия (главная + статистика). */
export const WELLBEING_INSTANT_CHART_BUCKET_HOURS = 2;
export const WELLBEING_INSTANT_CHART_BUCKET_MS = WELLBEING_INSTANT_CHART_BUCKET_HOURS * 60 * 60 * 1000;

export type WellbeingInstantChartPoint = { t: number; v: number };

/**
 * Сжимает instant-отметки в 2-часовые слоты от {@link windowStartMs}:
 * одна точка на слот — среднее значение; время точки — центр слота (не позже {@link clipEndMs}).
 */
export function bucketInstantWellbeingChartPoints(
  points: readonly WellbeingInstantChartPoint[],
  windowStartMs: number,
  clipEndMs: number,
): WellbeingInstantChartPoint[] {
  const buckets = new Map<number, number[]>();
  for (const p of points) {
    if (p.t > clipEndMs + 1e-6 || p.t < windowStartMs) continue;
    const bucketIndex = Math.floor((p.t - windowStartMs) / WELLBEING_INSTANT_CHART_BUCKET_MS);
    const arr = buckets.get(bucketIndex) ?? [];
    arr.push(p.v);
    buckets.set(bucketIndex, arr);
  }

  const out: WellbeingInstantChartPoint[] = [];
  for (const [bucketIndex, values] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    const bucketStart = windowStartMs + bucketIndex * WELLBEING_INSTANT_CHART_BUCKET_MS;
    const bucketCenter = bucketStart + WELLBEING_INSTANT_CHART_BUCKET_MS / 2;
    const t = Math.min(bucketCenter, clipEndMs);
    const v = values.reduce((acc, n) => acc + n, 0) / values.length;
    out.push({ t, v });
  }
  return out;
}
