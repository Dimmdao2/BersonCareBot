import { describe, expect, it } from "vitest";
import {
  calendarDayIndexSinceInstanceCreated,
  resolvePatientPlanPassageWindowUtc,
} from "./patient-plan-passage-stats";

describe("patient-plan-passage-stats", () => {
  it("calendarDayIndexSinceInstanceCreated counts local midnights from assignment day", () => {
    const idx = calendarDayIndexSinceInstanceCreated(
      "2026-01-01T12:00:00.000Z",
      new Date("2026-01-03T10:00:00.000Z").getTime(),
      "Europe/Moscow",
    );
    expect(idx).toBe(2);
  });

  it("resolvePatientPlanPassageWindowUtc clamps end before start and yields at least one day", () => {
    const w = resolvePatientPlanPassageWindowUtc({
      createdAtIso: "2026-05-10T12:00:00.000Z",
      endAnchorIso: "2026-05-08T12:00:00.000Z",
      displayIana: "UTC",
    });
    expect(w.calendarDaysInWindow).toBe(1);
    expect(w.windowStartUtcIso).toMatch(/^2026-05-10/);
  });
});
