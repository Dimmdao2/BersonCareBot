import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { buildWellbeingWeekChartData } from "./buildWellbeingWeekChartData";
import type { SymptomEntry } from "@/modules/diaries/types";

let seq = 0;
const baseEntry = (overrides: Partial<SymptomEntry>): SymptomEntry => ({
  id: `e-${seq++}`,
  userId: "u",
  trackingId: "tr",
  value0_10: 3,
  entryType: "instant",
  recordedAt: "2026-05-09T10:00:00.000Z",
  source: "webapp",
  notes: null,
  createdAt: "2026-05-09T10:00:00.000Z",
  ...overrides,
});

describe("buildWellbeingWeekChartData", () => {
  const iana = "Europe/Moscow";
  /** 2026-05-09 — суббота; неделя Пн 2026-05-04 … вс 2026-05-10 в локальной зоне */
  const anchor = DateTime.fromISO("2026-05-09T12:00:00", { zone: iana });

  it("усредняет instant general_wellbeing по дням и ставит t на начало локальных суток", () => {
    const general: SymptomEntry[] = [
      baseEntry({
        recordedAt: "2026-05-06T08:00:00.000Z",
        value0_10: 2,
        entryType: "instant",
      }),
      baseEntry({
        recordedAt: "2026-05-06T18:00:00.000Z",
        value0_10: 4,
        entryType: "instant",
      }),
    ];
    const model = buildWellbeingWeekChartData(general, [], iana, { anchor });
    expect(model.aggregateSeries).toHaveLength(1);
    expect(model.aggregateSeries[0]!.v).toBe(3);
    const startDay = DateTime.fromISO("2026-05-06", { zone: iana }).startOf("day");
    expect(model.aggregateSeries[0]!.t).toBe(startDay.toMillis());
  });

  it("instantSeries содержит только instant-записи general_wellbeing", () => {
    const general: SymptomEntry[] = [
      baseEntry({ recordedAt: "2026-05-07T09:00:00.000Z", value0_10: 4 }),
      baseEntry({
        recordedAt: "2026-05-08T15:00:00.000Z",
        value0_10: 5,
        entryType: "daily",
      }),
    ];
    const model = buildWellbeingWeekChartData(general, [], iana, { anchor });
    expect(model.instantSeries).toHaveLength(1);
    expect(model.instantSeries[0]!.v).toBe(4);
  });

  it("явные weekStartMs/weekEndMs совпадают с неделей от anchor", () => {
    const weekStart = anchor.startOf("week");
    const weekEnd = weekStart.plus({ weeks: 1 });
    const modelExplicit = buildWellbeingWeekChartData([], [], iana, {
      weekStartMs: weekStart.toMillis(),
      weekEndMs: weekEnd.toMillis(),
    });
    const modelAnchor = buildWellbeingWeekChartData([], [], iana, { anchor });
    expect(modelExplicit.weekStartMs).toBe(modelAnchor.weekStartMs);
    expect(modelExplicit.weekEndMs).toBe(modelAnchor.weekEndMs);
  });

  it("warmupScatter маппит только 1/3/5 в band", () => {
    const warmup: SymptomEntry[] = [
      baseEntry({ recordedAt: "2026-05-07T12:00:00.000Z", value0_10: 1 }),
      baseEntry({ recordedAt: "2026-05-08T12:00:00.000Z", value0_10: 3 }),
      baseEntry({ recordedAt: "2026-05-09T12:00:00.000Z", value0_10: 5 }),
      baseEntry({ recordedAt: "2026-05-09T13:00:00.000Z", value0_10: 2 }),
    ];
    const model = buildWellbeingWeekChartData([], warmup, iana, { anchor });
    expect(model.warmupScatter).toHaveLength(3);
    expect(model.warmupScatter.map((p) => p.band)).toEqual(["low", "mid", "high"]);
  });

  it("отбрасывает записи вне текущей недели", () => {
    const general: SymptomEntry[] = [
      baseEntry({ recordedAt: "2026-05-03T12:00:00.000Z", value0_10: 5 }),
      baseEntry({ recordedAt: "2026-05-07T12:00:00.000Z", value0_10: 3 }),
    ];
    const model = buildWellbeingWeekChartData(general, [], iana, { anchor });
    expect(model.instantSeries).toHaveLength(1);
    expect(model.instantSeries[0]!.v).toBe(3);
  });
});
