/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DateTime } from "luxon";
import { render } from "@testing-library/react";
import { PatientHomeWellbeingWeekStrip } from "./PatientHomeWellbeingWeekStrip";

describe("PatientHomeWellbeingWeekStrip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("draws a horizontal dashed path to the first score (Monday-only), not a vertical tick", () => {
    const monday = DateTime.fromObject({ year: 2026, month: 5, day: 18, hour: 12 }, { zone: "Europe/Moscow" });
    vi.setSystemTime(monday.toMillis());
    const { container } = render(
      <PatientHomeWellbeingWeekStrip
        days={[{ date: "2026-05-18", score: 5, warmupHint: null, diaryNoteHint: null }]}
        timeZone="Europe/Moscow"
      />,
    );
    const dashed = container.querySelector('path[stroke-dasharray="4 3"]');
    expect(dashed).not.toBeNull();
    const d = dashed?.getAttribute("d") ?? "";
    expect(d.startsWith("M 0 ")).toBe(true);
    expect(container.querySelectorAll("line[x1][x2]").length).toBe(1);
  });

  it("uses a solid gradient bridge from previous Sunday to Monday when both exist", () => {
    const monday = DateTime.fromObject({ year: 2026, month: 5, day: 18, hour: 12 }, { zone: "Europe/Moscow" });
    vi.setSystemTime(monday.toMillis());
    const { container } = render(
      <PatientHomeWellbeingWeekStrip
        days={[{ date: "2026-05-18", score: 5, warmupHint: null, diaryNoteHint: null }]}
        timeZone="Europe/Moscow"
        previousSundayScore={4}
        lastScoreBeforeWeek={4}
      />,
    );
    expect(container.querySelector('path[stroke-dasharray="4 3"]')).toBeNull();
    expect(container.querySelector("linearGradient")).not.toBeNull();
  });
});
