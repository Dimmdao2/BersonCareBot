import { describe, expect, it } from "vitest";
import {
  aggregateSymptomEntriesByDay,
  aggregateSymptomEntriesByDaySplit,
  buildLfkOverviewMatrix,
  lfkDotsLast7DaysFromSessions,
} from "../aggregation";

describe("aggregateSymptomEntriesByDay", () => {
  it("returns empty for empty input", () => {
    expect(aggregateSymptomEntriesByDay([])).toEqual([]);
  });

  it("takes max value per UTC day", () => {
    const pts = aggregateSymptomEntriesByDay([
      { recordedAt: "2025-03-01T10:00:00.000Z", value0_10: 3, entryType: "instant" },
      { recordedAt: "2025-03-01T18:00:00.000Z", value0_10: 7, entryType: "daily" },
    ]);
    expect(pts).toEqual([{ date: "2025-03-01", value: 7, entryType: "daily" }]);
  });

  it("on tie uses later recordedAt for entryType", () => {
    const pts = aggregateSymptomEntriesByDay([
      { recordedAt: "2025-03-01T10:00:00.000Z", value0_10: 5, entryType: "instant" },
      { recordedAt: "2025-03-01T20:00:00.000Z", value0_10: 5, entryType: "daily" },
    ]);
    expect(pts[0]?.entryType).toBe("daily");
  });

  it("sorts days ascending", () => {
    const pts = aggregateSymptomEntriesByDay([
      { recordedAt: "2025-03-02T10:00:00.000Z", value0_10: 1, entryType: "instant" },
      { recordedAt: "2025-03-01T10:00:00.000Z", value0_10: 2, entryType: "instant" },
    ]);
    expect(pts.map((p) => p.date)).toEqual(["2025-03-01", "2025-03-02"]);
  });
});

describe("aggregateSymptomEntriesByDaySplit", () => {
  it("returns empty for empty input", () => {
    expect(aggregateSymptomEntriesByDaySplit([])).toEqual([]);
  });

  it("keeps separate max per day for instant and daily", () => {
    const pts = aggregateSymptomEntriesByDaySplit([
      { recordedAt: "2025-03-01T10:00:00.000Z", value0_10: 3, entryType: "instant" },
      { recordedAt: "2025-03-01T18:00:00.000Z", value0_10: 7, entryType: "daily" },
    ]);
    expect(pts).toEqual([{ date: "2025-03-01", instant: 3, daily: 7 }]);
  });

  it("takes max within same type on same day", () => {
    const pts = aggregateSymptomEntriesByDaySplit([
      { recordedAt: "2025-03-01T10:00:00.000Z", value0_10: 2, entryType: "instant" },
      { recordedAt: "2025-03-01T20:00:00.000Z", value0_10: 5, entryType: "instant" },
    ]);
    expect(pts).toEqual([{ date: "2025-03-01", instant: 5, daily: null }]);
  });

  it("sorts days ascending", () => {
    const pts = aggregateSymptomEntriesByDaySplit([
      { recordedAt: "2025-03-02T10:00:00.000Z", value0_10: 1, entryType: "daily" },
      { recordedAt: "2025-03-01T10:00:00.000Z", value0_10: 2, entryType: "instant" },
    ]);
    expect(pts.map((p) => p.date)).toEqual(["2025-03-01", "2025-03-02"]);
  });
});

describe("lfkDotsLast7DaysFromSessions", () => {
  it("maps session counts to dot states for last 7 UTC days", () => {
    const fixed = new Date("2025-03-23T12:00:00.000Z");
    const sessions = [{ completedAt: "2025-03-23T08:00:00.000Z" }];
    const dots = lfkDotsLast7DaysFromSessions(sessions, fixed);
    expect(dots).toHaveLength(7);
    expect(dots[6]).toBe("done");
  });
});

describe("buildLfkOverviewMatrix", () => {
  it("marks cells when session exists for day and complex", () => {
    const matrix = buildLfkOverviewMatrix(
      ["2025-03-20", "2025-03-21"],
      ["c1", "c2"],
      [{ complexId: "c1", completedAt: "2025-03-20T12:00:00.000Z" }]
    );
    expect(matrix).toEqual([
      [true, false],
      [false, false],
    ]);
  });
});
