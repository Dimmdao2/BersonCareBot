import { DateTime } from "luxon";
import type { SymptomEntry } from "@/modules/diaries/types";

/** Опции расчёта недели: либо явные ms-границы (как у SQL-окна загрузки), либо якорная дата. */
export type BuildWellbeingWeekChartOptions = {
  /** Явный интервал [start, end) в миллисекундах — предпочтительно из лоадера вместе с запросом к БД. */
  weekStartMs?: number;
  weekEndMs?: number;
  /** Если границы не заданы: «сейчас» для startOf(week) в зоне {@link iana}. Для тестов. */
  anchor?: DateTime;
};

export type WellbeingWeekPoint = { t: number; v: number };

export type WarmupScatterBand = "low" | "mid" | "high";

export type WarmupScatterPoint = { t: number; v: number; band: WarmupScatterBand };

export type WellbeingWeekChartModel = {
  aggregateSeries: WellbeingWeekPoint[];
  instantSeries: WellbeingWeekPoint[];
  warmupScatter: WarmupScatterPoint[];
  weekStartMs: number;
  weekEndMs: number;
};

function warmupValueToBand(value: number): WarmupScatterBand | null {
  if (value === 1) return "low";
  if (value === 3) return "mid";
  if (value === 5) return "high";
  return null;
}

/** Локальная полночь календарного дня — чтобы график «Среднее за день» начинался у левой границы дня и совпадал с осью (не полдень). */
function startOfLocalDayMillis(localYmd: string, iana: string): number {
  return DateTime.fromISO(localYmd, { zone: iana }).startOf("day").toMillis();
}

/**
 * Строит три серии для недельного графика самочувствия (календарная неделя Пн–Вс в {@link iana}).
 * Записи могут выходить за окно — отфильтровываются по {@link recordedAt}.
 */
export function buildWellbeingWeekChartData(
  generalEntries: SymptomEntry[],
  warmupEntries: SymptomEntry[],
  iana: string,
  options?: BuildWellbeingWeekChartOptions,
): WellbeingWeekChartModel {
  let weekStartMs: number;
  let weekEndMs: number;
  if (options?.weekStartMs != null && options?.weekEndMs != null) {
    weekStartMs = options.weekStartMs;
    weekEndMs = options.weekEndMs;
  } else {
    const anchor = (options?.anchor ?? DateTime.now()).setZone(iana);
    const weekStart = anchor.startOf("week");
    const weekEnd = weekStart.plus({ weeks: 1 });
    weekStartMs = weekStart.toMillis();
    weekEndMs = weekEnd.toMillis();
  }

  const inWeek = (iso: string) => {
    const ms = new Date(iso).getTime();
    return ms >= weekStartMs && ms < weekEndMs;
  };

  const generalInWeek = generalEntries.filter((e) => inWeek(e.recordedAt));
  const warmupInWeek = warmupEntries.filter((e) => inWeek(e.recordedAt));

  const instantForAgg = generalInWeek.filter((e) => e.entryType === "instant");
  const byDay = new Map<string, number[]>();
  for (const e of instantForAgg) {
    const localD = DateTime.fromISO(e.recordedAt, { zone: "utc" }).setZone(iana).toISODate();
    if (!localD) continue;
    const arr = byDay.get(localD) ?? [];
    arr.push(e.value0_10);
    byDay.set(localD, arr);
  }

  const aggregateSeries: WellbeingWeekPoint[] = [...byDay.entries()]
    .map(([localYmd, vals]) => {
      const sum = vals.reduce((a, b) => a + b, 0);
      const v = sum / vals.length;
      return { t: startOfLocalDayMillis(localYmd, iana), v };
    })
    .filter((p) => p.t >= weekStartMs && p.t < weekEndMs)
    .sort((a, b) => a.t - b.t);

  /** Линия «в течение дня» — только instant; daily не смешиваем с поминутной шкалой. */
  const instantSeries: WellbeingWeekPoint[] = generalInWeek
    .filter((e) => e.entryType === "instant")
    .map((e) => ({ t: new Date(e.recordedAt).getTime(), v: e.value0_10 }))
    .sort((a, b) => a.t - b.t);

  const warmupScatter: WarmupScatterPoint[] = [];
  for (const e of warmupInWeek) {
    const band = warmupValueToBand(e.value0_10);
    if (!band) continue;
    warmupScatter.push({
      t: new Date(e.recordedAt).getTime(),
      v: e.value0_10,
      band,
    });
  }
  warmupScatter.sort((a, b) => a.t - b.t);

  return {
    aggregateSeries,
    instantSeries,
    warmupScatter,
    weekStartMs,
    weekEndMs,
  };
}
