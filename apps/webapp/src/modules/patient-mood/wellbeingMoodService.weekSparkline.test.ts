import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DateTime } from "luxon";
import { createPatientMoodService, type PatientWellbeingMoodDeps } from "./wellbeingMoodService";

describe("createPatientMoodService getWeekSparkline", () => {
  const trackingId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const userId = "ffffffff-aaaa-bbbb-cccc-dddddddddddd";
  const tz = "Europe/Moscow";

  const listSymptomEntriesForTrackingInRange = vi.fn();
  const deps = {
    diaries: {
      ensureGeneralWellbeingTracking: vi.fn().mockResolvedValue({ id: trackingId }),
      listSymptomEntriesForTrackingInRange,
      addEntry: vi.fn(),
      updateSymptomEntry: vi.fn(),
      listSymptomEntriesForUserInRange: vi.fn(),
    } as unknown as PatientWellbeingMoodDeps["diaries"],
    references: {
      listActiveItemsByCategoryCode: vi.fn().mockResolvedValue([
        { id: "ref-gw", code: "general_wellbeing", title: "Общее самочувствие" },
      ]),
    },
  } as unknown as PatientWellbeingMoodDeps;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(DateTime.fromObject({ year: 2026, month: 5, day: 9, hour: 12 }, { zone: tz }).toMillis());
    listSymptomEntriesForTrackingInRange.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns Mon–Sun of current week in tz and averages instant scores per day (rounded)", async () => {
    listSymptomEntriesForTrackingInRange.mockResolvedValue([
      {
        id: "1",
        userId,
        trackingId,
        value0_10: 3,
        entryType: "instant",
        recordedAt: DateTime.fromISO("2026-05-06T10:00:00", { zone: tz }).toUTC().toISO()!,
        source: "webapp",
        notes: null,
        createdAt: "",
      },
      {
        id: "2",
        userId,
        trackingId,
        value0_10: 5,
        entryType: "instant",
        recordedAt: DateTime.fromISO("2026-05-06T18:00:00", { zone: tz }).toUTC().toISO()!,
        source: "webapp",
        notes: null,
        createdAt: "",
      },
      {
        id: "3",
        userId,
        trackingId,
        value0_10: 5,
        entryType: "daily",
        recordedAt: DateTime.fromISO("2026-05-06T12:00:00", { zone: tz }).toUTC().toISO()!,
        source: "webapp",
        notes: null,
        createdAt: "",
      },
    ]);

    const svc = createPatientMoodService(deps);
    const { days } = await svc.getWeekSparkline(userId, tz);

    expect(days.map((d) => d.date)).toEqual([
      "2026-05-04",
      "2026-05-05",
      "2026-05-06",
      "2026-05-07",
      "2026-05-08",
      "2026-05-09",
      "2026-05-10",
    ]);

    const wed = days.find((d) => d.date === "2026-05-06");
    expect(wed?.score).toBe(4);
  });

  it("rounds mean to nearest integer in 1…5", async () => {
    listSymptomEntriesForTrackingInRange.mockResolvedValue([
      {
        id: "a",
        userId,
        trackingId,
        value0_10: 2,
        entryType: "instant",
        recordedAt: DateTime.fromISO("2026-05-05T08:00:00", { zone: tz }).toUTC().toISO()!,
        source: "webapp",
        notes: null,
        createdAt: "",
      },
      {
        id: "b",
        userId,
        trackingId,
        value0_10: 3,
        entryType: "instant",
        recordedAt: DateTime.fromISO("2026-05-05T20:00:00", { zone: tz }).toUTC().toISO()!,
        source: "webapp",
        notes: null,
        createdAt: "",
      },
    ]);

    const svc = createPatientMoodService(deps);
    const { days } = await svc.getWeekSparkline(userId, tz);
    const tue = days.find((d) => d.date === "2026-05-05");
    expect(tue?.score).toBe(3);
  });

  it("returns all instant marks for the week (not only daily average)", async () => {
    listSymptomEntriesForTrackingInRange.mockResolvedValue([
      {
        id: "a",
        userId,
        trackingId,
        value0_10: 2,
        entryType: "instant",
        recordedAt: DateTime.fromISO("2026-05-06T08:00:00", { zone: tz }).toUTC().toISO()!,
        source: "webapp",
        notes: null,
        createdAt: "",
      },
      {
        id: "b",
        userId,
        trackingId,
        value0_10: 4,
        entryType: "instant",
        recordedAt: DateTime.fromISO("2026-05-06T20:00:00", { zone: tz }).toUTC().toISO()!,
        source: "webapp",
        notes: null,
        createdAt: "",
      },
    ]);

    const svc = createPatientMoodService(deps);
    const { marks } = await svc.getWeekSparkline(userId, tz);
    expect(marks).toHaveLength(2);
    expect(marks.map((m) => m.score)).toEqual([2, 4]);
  });

  it("exposes previous-week bridge scores for the home strip", async () => {
    listSymptomEntriesForTrackingInRange.mockResolvedValue([
      {
        id: "sun",
        userId,
        trackingId,
        value0_10: 4,
        entryType: "instant",
        recordedAt: DateTime.fromISO("2026-05-03T12:00:00", { zone: tz }).toUTC().toISO()!,
        source: "webapp",
        notes: null,
        createdAt: "",
      },
      {
        id: "mon",
        userId,
        trackingId,
        value0_10: 5,
        entryType: "instant",
        recordedAt: DateTime.fromISO("2026-05-04T12:00:00", { zone: tz }).toUTC().toISO()!,
        source: "webapp",
        notes: null,
        createdAt: "",
      },
    ]);

    const svc = createPatientMoodService(deps);
    const sparkline = await svc.getWeekSparkline(userId, tz);
    expect(sparkline.previousSundayHadMarks).toBe(true);
    expect(sparkline.previousSundayLastScore).toBe(4);
    expect(sparkline.previousSundayScore).toBe(4);
    expect(sparkline.lastScoreBeforeWeek).toBe(4);
    expect(sparkline.days.find((d) => d.date === "2026-05-04")?.score).toBe(5);
  });
});

describe("createPatientMoodService getRecentDaysSparkline", () => {
  const trackingId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const userId = "ffffffff-aaaa-bbbb-cccc-dddddddddddd";
  const tz = "Europe/Moscow";

  const listSymptomEntriesForTrackingInRange = vi.fn();
  const deps = {
    diaries: {
      ensureGeneralWellbeingTracking: vi.fn().mockResolvedValue({ id: trackingId }),
      listSymptomEntriesForTrackingInRange,
      addEntry: vi.fn(),
      updateSymptomEntry: vi.fn(),
      listSymptomEntriesForUserInRange: vi.fn(),
    } as unknown as PatientWellbeingMoodDeps["diaries"],
    references: {
      listActiveItemsByCategoryCode: vi.fn().mockResolvedValue([
        { id: "ref-gw", code: "general_wellbeing", title: "Общее самочувствие" },
      ]),
    },
  } as unknown as PatientWellbeingMoodDeps;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(DateTime.fromObject({ year: 2026, month: 5, day: 9, hour: 12 }, { zone: tz }).toMillis());
    listSymptomEntriesForTrackingInRange.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns last 3 calendar days including today in tz", async () => {
    listSymptomEntriesForTrackingInRange.mockResolvedValue([]);

    const svc = createPatientMoodService(deps);
    const { days } = await svc.getRecentDaysSparkline(userId, tz, 3);

    expect(days.map((d) => d.date)).toEqual(["2026-05-07", "2026-05-08", "2026-05-09"]);
  });

  it("returns instant marks only within the 3-day window", async () => {
    listSymptomEntriesForTrackingInRange.mockResolvedValue([
      {
        id: "old",
        userId,
        trackingId,
        value0_10: 2,
        entryType: "instant",
        recordedAt: DateTime.fromISO("2026-05-06T08:00:00", { zone: tz }).toUTC().toISO()!,
        source: "webapp",
        notes: null,
        createdAt: "",
      },
      {
        id: "in",
        userId,
        trackingId,
        value0_10: 4,
        entryType: "instant",
        recordedAt: DateTime.fromISO("2026-05-08T08:00:00", { zone: tz }).toUTC().toISO()!,
        source: "webapp",
        notes: null,
        createdAt: "",
      },
    ]);

    const svc = createPatientMoodService(deps);
    const { marks } = await svc.getRecentDaysSparkline(userId, tz, 3);
    expect(marks).toHaveLength(1);
    expect(marks[0]?.score).toBe(4);
  });

  it("exposes anchor-day bridge scores for the home strip", async () => {
    listSymptomEntriesForTrackingInRange.mockResolvedValue([
      {
        id: "anchor",
        userId,
        trackingId,
        value0_10: 3,
        entryType: "instant",
        recordedAt: DateTime.fromISO("2026-05-06T12:00:00", { zone: tz }).toUTC().toISO()!,
        source: "webapp",
        notes: null,
        createdAt: "",
      },
      {
        id: "win",
        userId,
        trackingId,
        value0_10: 5,
        entryType: "instant",
        recordedAt: DateTime.fromISO("2026-05-07T12:00:00", { zone: tz }).toUTC().toISO()!,
        source: "webapp",
        notes: null,
        createdAt: "",
      },
    ]);

    const svc = createPatientMoodService(deps);
    const sparkline = await svc.getRecentDaysSparkline(userId, tz, 3);
    expect(sparkline.previousSundayHadMarks).toBe(true);
    expect(sparkline.previousSundayLastScore).toBe(3);
    expect(sparkline.lastScoreBeforeWeek).toBe(3);
  });
});
