import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DateTime } from "luxon";
import {
  bucketWellbeingStripMarksForChart,
  buildPatientHomeWellbeingWeekStripChart,
  HOME_WELLBEING_STRIP_CHART_WIDTH,
  HOME_WELLBEING_STRIP_DAY_COUNT,
} from "./buildPatientHomeWellbeingWeekStripChart";

const tz = "Europe/Moscow";

describe("bucketWellbeingStripMarksForChart", () => {
  it("merges marks within the same 2h slot into one averaged point", () => {
    const windowStartMs = DateTime.fromISO("2026-05-20T00:00:00", { zone: tz }).toMillis();
    const nowMs = DateTime.fromISO("2026-05-20T14:00:00", { zone: tz }).toMillis();
    const bucketed = bucketWellbeingStripMarksForChart(
      [
        { recordedAt: DateTime.fromISO("2026-05-20T10:05:00", { zone: tz }).toUTC().toISO()!, score: 2 },
        { recordedAt: DateTime.fromISO("2026-05-20T10:20:00", { zone: tz }).toUTC().toISO()!, score: 4 },
        { recordedAt: DateTime.fromISO("2026-05-20T10:50:00", { zone: tz }).toUTC().toISO()!, score: 4 },
      ],
      windowStartMs,
      nowMs,
    );
    expect(bucketed).toHaveLength(1);
    expect(bucketed[0]!.score).toBe(3);
  });

  it("keeps separate points for marks in different 2h slots", () => {
    const windowStartMs = DateTime.fromISO("2026-05-20T00:00:00", { zone: tz }).toMillis();
    const nowMs = DateTime.fromISO("2026-05-20T18:00:00", { zone: tz }).toMillis();
    const bucketed = bucketWellbeingStripMarksForChart(
      [
        { recordedAt: DateTime.fromISO("2026-05-20T09:30:00", { zone: tz }).toUTC().toISO()!, score: 2 },
        { recordedAt: DateTime.fromISO("2026-05-20T13:30:00", { zone: tz }).toUTC().toISO()!, score: 5 },
      ],
      windowStartMs,
      nowMs,
    );
    expect(bucketed).toHaveLength(2);
    expect(bucketed.map((m) => m.score)).toEqual([2, 5]);
  });
});

describe("buildPatientHomeWellbeingWeekStripChart", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("connects marks in time order with dashed lead when anchor day had no marks", () => {
    const thursday = DateTime.fromObject({ year: 2026, month: 5, day: 21, hour: 12 }, { zone: tz });
    vi.setSystemTime(thursday.toMillis());
    const windowStartIso = thursday.minus({ days: HOME_WELLBEING_STRIP_DAY_COUNT - 1 }).toISODate()!;
    const { segments } = buildPatientHomeWellbeingWeekStripChart({
      marks: [
        { recordedAt: DateTime.fromISO("2026-05-19T09:00:00", { zone: tz }).toUTC().toISO()!, score: 3 },
        { recordedAt: DateTime.fromISO("2026-05-20T10:00:00", { zone: tz }).toUTC().toISO()!, score: 5 },
      ],
      timeZone: tz,
      todayIso: "2026-05-21",
      windowStartIso,
      nowMs: thursday.toMillis(),
      anchorDayBeforeWindowHadMarks: false,
      anchorDayBeforeWindowLastScore: null,
      lastScoreBeforeWindow: null,
    });
    const dashed = segments.filter((s) => s.kind === "dashed");
    const solid = segments.filter((s) => s.kind === "solid");
    expect(dashed.some((s) => s.key === "lead")).toBe(true);
    expect(solid.some((s) => s.key === "solid-0")).toBe(true);
  });

  it("clips line at nowX and draws dashed tail when today has no marks", () => {
    const friday = DateTime.fromObject({ year: 2026, month: 5, day: 22, hour: 15 }, { zone: tz });
    vi.setSystemTime(friday.toMillis());
    const windowStartIso = friday.minus({ days: HOME_WELLBEING_STRIP_DAY_COUNT - 1 }).toISODate()!;
    const { segments, nowX } = buildPatientHomeWellbeingWeekStripChart({
      marks: [
        { recordedAt: DateTime.fromISO("2026-05-21T10:00:00", { zone: tz }).toUTC().toISO()!, score: 4 },
      ],
      timeZone: tz,
      todayIso: "2026-05-22",
      windowStartIso,
      nowMs: friday.toMillis(),
      anchorDayBeforeWindowHadMarks: false,
      anchorDayBeforeWindowLastScore: null,
      lastScoreBeforeWindow: null,
    });
    expect(nowX).toBeGreaterThan(0);
    expect(nowX).toBeLessThan(HOME_WELLBEING_STRIP_CHART_WIDTH);
    const tail = segments.find((s) => s.key === "tail-now");
    expect(tail).toBeDefined();
    expect(tail!.kind).toBe("dashed");
    expect(tail!.x1).toBeCloseTo(nowX, 0);
  });

  it("extends solid tail to nowX when there is a mark today", () => {
    const friday = DateTime.fromObject({ year: 2026, month: 5, day: 22, hour: 10 }, { zone: tz });
    vi.setSystemTime(friday.toMillis());
    const windowStartIso = friday.minus({ days: HOME_WELLBEING_STRIP_DAY_COUNT - 1 }).toISODate()!;
    const { segments, nowX } = buildPatientHomeWellbeingWeekStripChart({
      marks: [
        { recordedAt: DateTime.fromISO("2026-05-22T08:00:00", { zone: tz }).toUTC().toISO()!, score: 3 },
      ],
      timeZone: tz,
      todayIso: "2026-05-22",
      windowStartIso,
      nowMs: friday.toMillis(),
      anchorDayBeforeWindowHadMarks: false,
      anchorDayBeforeWindowLastScore: null,
      lastScoreBeforeWindow: null,
    });
    const tail = segments.find((s) => s.key === "tail-now");
    expect(tail).toBeDefined();
    expect(tail!.kind).toBe("solid");
    expect(tail!.x1).toBeCloseTo(nowX, 0);
    expect(tail!.x1).toBeLessThan(HOME_WELLBEING_STRIP_CHART_WIDTH);
  });

  it("uses solid bridge from anchor day before window when it had marks", () => {
    const monday = DateTime.fromObject({ year: 2026, month: 5, day: 18, hour: 12 }, { zone: tz });
    vi.setSystemTime(monday.toMillis());
    const windowStartIso = monday.minus({ days: HOME_WELLBEING_STRIP_DAY_COUNT - 1 }).toISODate()!;
    const { segments } = buildPatientHomeWellbeingWeekStripChart({
      marks: [
        { recordedAt: DateTime.fromISO("2026-05-18T11:00:00", { zone: tz }).toUTC().toISO()!, score: 5 },
      ],
      timeZone: tz,
      todayIso: "2026-05-18",
      windowStartIso,
      nowMs: monday.toMillis(),
      anchorDayBeforeWindowHadMarks: true,
      anchorDayBeforeWindowLastScore: 4,
      lastScoreBeforeWindow: 4,
    });
    expect(segments.find((s) => s.key === "lead")).toBeUndefined();
    expect(segments.find((s) => s.key === "window-anchor")?.kind).toBe("solid");
  });

  it("keeps the first in-window connection after a solid anchor bridge", () => {
    const wednesday = DateTime.fromObject({ year: 2026, month: 5, day: 20, hour: 15 }, { zone: tz });
    vi.setSystemTime(wednesday.toMillis());
    const windowStartIso = wednesday.minus({ days: HOME_WELLBEING_STRIP_DAY_COUNT - 1 }).toISODate()!;
    const { segments } = buildPatientHomeWellbeingWeekStripChart({
      marks: [
        { recordedAt: DateTime.fromISO("2026-05-19T10:00:00", { zone: tz }).toUTC().toISO()!, score: 3 },
        { recordedAt: DateTime.fromISO("2026-05-20T14:00:00", { zone: tz }).toUTC().toISO()!, score: 5 },
      ],
      timeZone: tz,
      todayIso: "2026-05-20",
      windowStartIso,
      nowMs: wednesday.toMillis(),
      anchorDayBeforeWindowHadMarks: true,
      anchorDayBeforeWindowLastScore: 4,
      lastScoreBeforeWindow: 4,
    });

    const firstConnection = segments.find((s) => s.key === "solid-0");
    expect(firstConnection?.kind).toBe("solid");
    expect(firstConnection?.x0).toBeLessThan(firstConnection?.x1 ?? 0);
  });

  it("uses fewer solid segments when many marks fall in the same 2h bucket", () => {
    const friday = DateTime.fromObject({ year: 2026, month: 5, day: 22, hour: 11 }, { zone: tz });
    vi.setSystemTime(friday.toMillis());
    const windowStartIso = friday.minus({ days: HOME_WELLBEING_STRIP_DAY_COUNT - 1 }).toISODate()!;
    const { segments } = buildPatientHomeWellbeingWeekStripChart({
      marks: [
        { recordedAt: DateTime.fromISO("2026-05-22T08:10:00", { zone: tz }).toUTC().toISO()!, score: 1 },
        { recordedAt: DateTime.fromISO("2026-05-22T08:25:00", { zone: tz }).toUTC().toISO()!, score: 5 },
        { recordedAt: DateTime.fromISO("2026-05-22T08:40:00", { zone: tz }).toUTC().toISO()!, score: 3 },
        { recordedAt: DateTime.fromISO("2026-05-22T09:05:00", { zone: tz }).toUTC().toISO()!, score: 4 },
      ],
      timeZone: tz,
      todayIso: "2026-05-22",
      windowStartIso,
      nowMs: friday.toMillis(),
      anchorDayBeforeWindowHadMarks: false,
      anchorDayBeforeWindowLastScore: null,
      lastScoreBeforeWindow: null,
    });
    const solidBetween = segments.filter((s) => s.kind === "solid" && s.key.startsWith("solid-"));
    expect(solidBetween.length).toBeLessThanOrEqual(1);
  });

  it("places nowX near the right edge within today (3-day window ends at end of today)", () => {
    const midday = DateTime.fromObject({ year: 2026, month: 5, day: 22, hour: 12 }, { zone: tz });
    vi.setSystemTime(midday.toMillis());
    const windowStartIso = midday.minus({ days: HOME_WELLBEING_STRIP_DAY_COUNT - 1 }).toISODate()!;
    const { nowX } = buildPatientHomeWellbeingWeekStripChart({
      marks: [],
      timeZone: tz,
      todayIso: "2026-05-22",
      windowStartIso,
      nowMs: midday.toMillis(),
      anchorDayBeforeWindowHadMarks: false,
      anchorDayBeforeWindowLastScore: null,
      lastScoreBeforeWindow: null,
    });
    expect(nowX).toBeGreaterThan(HOME_WELLBEING_STRIP_CHART_WIDTH * 0.8);
    expect(nowX).toBeLessThan(HOME_WELLBEING_STRIP_CHART_WIDTH);
  });
});
