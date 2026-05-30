/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DateTime } from "luxon";
import { render } from "@testing-library/react";
import { PatientHomeWellbeingWeekStrip } from "./PatientHomeWellbeingWeekStrip";
import { HOME_WELLBEING_STRIP_DAY_COUNT } from "./buildPatientHomeWellbeingWeekStripChart";

describe("PatientHomeWellbeingWeekStrip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("draws a horizontal dashed path to the first score, not a vertical tick", () => {
    const monday = DateTime.fromObject({ year: 2026, month: 5, day: 18, hour: 12 }, { zone: "Europe/Moscow" });
    vi.setSystemTime(monday.toMillis());
    const { container } = render(
      <PatientHomeWellbeingWeekStrip
        marks={[
          {
            recordedAt: DateTime.fromISO("2026-05-18T10:00:00", { zone: "Europe/Moscow" }).toUTC().toISO()!,
            score: 5,
          },
        ]}
        timeZone="Europe/Moscow"
        anchorNowMs={monday.toMillis()}
        todayIso={monday.toISODate()!}
      />,
    );
    const dashed = container.querySelector('path[stroke-dasharray="4 3"]');
    expect(dashed).not.toBeNull();
    const d = dashed?.getAttribute("d") ?? "";
    expect(d.startsWith("M 0 ")).toBe(true);
    expect(container.querySelectorAll("line").length).toBe(1);
  });

  it("uses a solid gradient bridge from anchor day when both exist", () => {
    const monday = DateTime.fromObject({ year: 2026, month: 5, day: 18, hour: 12 }, { zone: "Europe/Moscow" });
    vi.setSystemTime(monday.toMillis());
    const { container } = render(
      <PatientHomeWellbeingWeekStrip
        marks={[
          {
            recordedAt: DateTime.fromISO("2026-05-18T10:00:00", { zone: "Europe/Moscow" }).toUTC().toISO()!,
            score: 5,
          },
        ]}
        timeZone="Europe/Moscow"
        anchorNowMs={monday.toMillis()}
        todayIso={monday.toISODate()!}
        anchorDayBeforeWindowHadMarks
        anchorDayBeforeWindowLastScore={4}
        lastScoreBeforeWindow={4}
      />,
    );
    expect(container.querySelector('path[stroke-dasharray="4 3"]')).toBeNull();
    expect(container.querySelector("linearGradient")).not.toBeNull();
  });

  it("renders day labels for the rolling window only", () => {
    const wednesday = DateTime.fromObject({ year: 2026, month: 5, day: 20, hour: 12 }, { zone: "Europe/Moscow" });
    vi.setSystemTime(wednesday.toMillis());
    const { container } = render(
      <PatientHomeWellbeingWeekStrip
        marks={[]}
        timeZone="Europe/Moscow"
        anchorNowMs={wednesday.toMillis()}
        todayIso={wednesday.toISODate()!}
      />,
    );
    expect(container.querySelectorAll('[role="listitem"]')).toHaveLength(HOME_WELLBEING_STRIP_DAY_COUNT);
  });
});
