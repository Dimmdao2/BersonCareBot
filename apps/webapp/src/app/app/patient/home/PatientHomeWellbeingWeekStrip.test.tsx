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

  it("draws a short mood-colored tick when the only score has no rendered neighbor segment (Monday-only)", () => {
    const monday = DateTime.fromObject({ year: 2026, month: 5, day: 18, hour: 12 }, { zone: "Europe/Moscow" });
    vi.setSystemTime(monday.toMillis());
    const { container } = render(
      <PatientHomeWellbeingWeekStrip
        days={[{ date: "2026-05-18", score: 5, warmupHint: null, diaryNoteHint: null }]}
        timeZone="Europe/Moscow"
      />,
    );
    expect(container.querySelectorAll('line[stroke="#16a34a"]').length).toBeGreaterThanOrEqual(1);
  });
});
