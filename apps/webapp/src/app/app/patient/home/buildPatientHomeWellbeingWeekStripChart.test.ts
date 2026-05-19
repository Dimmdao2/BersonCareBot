import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DateTime } from "luxon";
import {
  buildPatientHomeWellbeingWeekStripChart,
  HOME_WELLBEING_STRIP_CHART_WIDTH,
} from "./buildPatientHomeWellbeingWeekStripChart";

const tz = "Europe/Moscow";

describe("buildPatientHomeWellbeingWeekStripChart", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("connects all marks in time order with solid segments (no dashed gap days)", () => {
    const wednesday = DateTime.fromObject({ year: 2026, month: 5, day: 20, hour: 12 }, { zone: tz });
    vi.setSystemTime(wednesday.toMillis());
    const { segments } = buildPatientHomeWellbeingWeekStripChart({
      marks: [
        { recordedAt: DateTime.fromISO("2026-05-18T09:00:00", { zone: tz }).toUTC().toISO()!, score: 3 },
        { recordedAt: DateTime.fromISO("2026-05-20T10:00:00", { zone: tz }).toUTC().toISO()!, score: 5 },
      ],
      timeZone: tz,
      todayIso: "2026-05-20",
      weekMondayIso: "2026-05-18",
      nowMs: wednesday.toMillis(),
      previousSundayHadMarks: false,
      previousSundayLastScore: null,
      lastScoreBeforeWeek: null,
    });
    const dashed = segments.filter((s) => s.kind === "dashed");
    const solid = segments.filter((s) => s.kind === "solid");
    expect(dashed).toHaveLength(1);
    expect(dashed[0]!.key).toBe("lead");
    expect(solid).toHaveLength(1);
    expect(solid[0]!.key).toBe("solid-0");
  });

  it("clips line at nowX and draws dashed tail when today has no marks", () => {
    const friday = DateTime.fromObject({ year: 2026, month: 5, day: 22, hour: 15 }, { zone: tz });
    vi.setSystemTime(friday.toMillis());
    const { segments, nowX } = buildPatientHomeWellbeingWeekStripChart({
      marks: [
        { recordedAt: DateTime.fromISO("2026-05-21T10:00:00", { zone: tz }).toUTC().toISO()!, score: 4 },
      ],
      timeZone: tz,
      todayIso: "2026-05-22",
      weekMondayIso: "2026-05-18",
      nowMs: friday.toMillis(),
      previousSundayHadMarks: false,
      previousSundayLastScore: null,
      lastScoreBeforeWeek: null,
    });
    expect(nowX).toBeGreaterThan(0);
    expect(nowX).toBeLessThan(HOME_WELLBEING_STRIP_CHART_WIDTH);
    const tail = segments.find((s) => s.key === "tail-now");
    expect(tail).toBeDefined();
    expect(tail!.kind).toBe("dashed");
    expect(tail!.x1).toBeCloseTo(nowX, 0);
  });

  it("uses solid bridge from Sunday when previousSundayHadMarks", () => {
    const monday = DateTime.fromObject({ year: 2026, month: 5, day: 18, hour: 12 }, { zone: tz });
    vi.setSystemTime(monday.toMillis());
    const { segments } = buildPatientHomeWellbeingWeekStripChart({
      marks: [
        { recordedAt: DateTime.fromISO("2026-05-18T11:00:00", { zone: tz }).toUTC().toISO()!, score: 5 },
      ],
      timeZone: tz,
      todayIso: "2026-05-18",
      weekMondayIso: "2026-05-18",
      nowMs: monday.toMillis(),
      previousSundayHadMarks: true,
      previousSundayLastScore: 4,
      lastScoreBeforeWeek: 4,
    });
    expect(segments.find((s) => s.key === "lead")).toBeUndefined();
    expect(segments.find((s) => s.key === "sun-mon")?.kind).toBe("solid");
  });
});
