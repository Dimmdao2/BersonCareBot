import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DateTime } from "luxon";
import { createPatientMoodService, type PatientWellbeingMoodDeps } from "./wellbeingMoodService";

describe("createPatientMoodService getWeekSparkline", () => {
  const trackingId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const userId = "ffffffff-aaaa-bbbb-cccc-dddddddddddd";
  const tz = "Europe/Moscow";

  const listSymptomEntriesForTrackingInRange = vi.fn();
  const deps: PatientWellbeingMoodDeps = {
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
  };

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
    const days = await svc.getWeekSparkline(userId, tz);

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
    const days = await svc.getWeekSparkline(userId, tz);
    const tue = days.find((d) => d.date === "2026-05-05");
    expect(tue?.score).toBe(3);
  });
});
