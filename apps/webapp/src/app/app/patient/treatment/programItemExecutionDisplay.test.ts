import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import {
  formatProgramItemExecutionLabel,
  formatProgramItemLastDoneSummaryText,
  resolveProgramItemExecutionDots,
} from "./programItemExecutionDisplay";

const ZONE = "Europe/Moscow";

describe("formatProgramItemExecutionLabel", () => {
  const now = DateTime.fromISO("2026-06-01T12:00:00", { zone: ZONE });

  it("returns never when no last activity", () => {
    expect(formatProgramItemExecutionLabel({ lastIso: null, zone: ZONE, now })).toBe(
      "Выполнялось: никогда",
    );
  });

  it("returns today lowercase without suffix", () => {
    expect(
      formatProgramItemExecutionLabel({
        lastIso: "2026-06-01T08:00:00.000Z",
        zone: ZONE,
        now,
      }),
    ).toBe("Выполнялось: сегодня");
  });

  it("returns yesterday", () => {
    expect(
      formatProgramItemExecutionLabel({
        lastIso: "2026-05-31T08:00:00.000Z",
        zone: ZONE,
        now,
      }),
    ).toBe("Выполнялось: вчера");
  });
});

describe("resolveProgramItemExecutionDots", () => {
  const now = DateTime.fromISO("2026-06-01T12:00:00", { zone: ZONE });

  it("gray dot for never", () => {
    expect(resolveProgramItemExecutionDots({ lastIso: null, todayCount: 0, zone: ZONE, now })).toEqual({
      variant: "gray",
      dotCount: 1,
      dotOverflow: 0,
    });
  });

  it("green dots when last activity is today", () => {
    expect(
      resolveProgramItemExecutionDots({
        lastIso: "2026-06-01T08:00:00.000Z",
        todayCount: 3,
        zone: ZONE,
        now,
      }),
    ).toEqual({ variant: "green", dotCount: 3, dotOverflow: 0 });
  });

  it("gray dot when last activity was earlier", () => {
    expect(
      resolveProgramItemExecutionDots({
        lastIso: "2026-05-30T08:00:00.000Z",
        todayCount: 2,
        zone: ZONE,
        now,
      }),
    ).toEqual({ variant: "gray", dotCount: 1, dotOverflow: 0 });
  });
});

describe("formatProgramItemLastDoneSummaryText", () => {
  it("formats reps and weight", () => {
    expect(formatProgramItemLastDoneSummaryText({ reps: 12, sets: 3, weightKg: 5 })).toBe(
      "сделано 12 × 3 с весом 5 кг",
    );
  });

  it("formats reps only", () => {
    expect(formatProgramItemLastDoneSummaryText({ reps: 10, weightKg: null })).toBe(
      "сделано 10",
    );
  });

  it("hides empty done summary", () => {
    expect(formatProgramItemLastDoneSummaryText({ reps: null, sets: null, weightKg: null })).toBe(
      null,
    );
  });
});
