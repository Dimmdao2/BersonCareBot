import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { bucketInstantWellbeingChartPoints } from "./wellbeingInstantChartBucketing";

const tz = "Europe/Moscow";

describe("bucketInstantWellbeingChartPoints", () => {
  it("merges points within the same 2h slot", () => {
    const windowStartMs = DateTime.fromISO("2026-05-20T00:00:00", { zone: tz }).toMillis();
    const clipEndMs = DateTime.fromISO("2026-05-20T14:00:00", { zone: tz }).toMillis();
    const bucketed = bucketInstantWellbeingChartPoints(
      [
        { t: DateTime.fromISO("2026-05-20T10:05:00", { zone: tz }).toMillis(), v: 2 },
        { t: DateTime.fromISO("2026-05-20T10:20:00", { zone: tz }).toMillis(), v: 4 },
        { t: DateTime.fromISO("2026-05-20T10:50:00", { zone: tz }).toMillis(), v: 4 },
      ],
      windowStartMs,
      clipEndMs,
    );
    expect(bucketed).toHaveLength(1);
    expect(bucketed[0]!.v).toBe(10 / 3);
  });

  it("keeps separate points for different 2h slots", () => {
    const windowStartMs = DateTime.fromISO("2026-05-20T00:00:00", { zone: tz }).toMillis();
    const clipEndMs = DateTime.fromISO("2026-05-20T18:00:00", { zone: tz }).toMillis();
    const bucketed = bucketInstantWellbeingChartPoints(
      [
        { t: DateTime.fromISO("2026-05-20T09:30:00", { zone: tz }).toMillis(), v: 2 },
        { t: DateTime.fromISO("2026-05-20T13:30:00", { zone: tz }).toMillis(), v: 5 },
      ],
      windowStartMs,
      clipEndMs,
    );
    expect(bucketed).toHaveLength(2);
    expect(bucketed.map((p) => p.v)).toEqual([2, 5]);
  });
});
