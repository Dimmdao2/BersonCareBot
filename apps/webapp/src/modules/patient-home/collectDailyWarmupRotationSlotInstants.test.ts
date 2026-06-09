import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { collectDailyWarmupRotationSlotInstants } from "./collectDailyWarmupRotationSlotInstants";

describe("collectDailyWarmupRotationSlotInstants", () => {
  it("returns slots after lastRotationAt up to now", () => {
    const iana = "Europe/Moscow";
    const last = DateTime.fromObject({ year: 2026, month: 6, day: 9, hour: 7, minute: 0 }, { zone: iana });
    const now = DateTime.fromObject({ year: 2026, month: 6, day: 9, hour: 15, minute: 0 }, { zone: iana });

    const slots = collectDailyWarmupRotationSlotInstants({
      scheduleTimes: ["08:00", "14:00"],
      patientIana: iana,
      lastRotationAt: last.toUTC().toISO(),
      now: now.toJSDate(),
    });

    expect(slots).toHaveLength(2);
  });

  it("collects slots across midnight", () => {
    const iana = "Europe/Moscow";
    const last = DateTime.fromObject({ year: 2026, month: 6, day: 8, hour: 19, minute: 0 }, { zone: iana });
    const now = DateTime.fromObject({ year: 2026, month: 6, day: 9, hour: 9, minute: 0 }, { zone: iana });

    const slots = collectDailyWarmupRotationSlotInstants({
      scheduleTimes: ["20:00", "08:00"],
      patientIana: iana,
      lastRotationAt: last.toUTC().toISO(),
      now: now.toJSDate(),
    });

    expect(slots).toHaveLength(2);
  });

  it("returns empty when lastRotationAt is null", () => {
    const slots = collectDailyWarmupRotationSlotInstants({
      scheduleTimes: ["08:00"],
      patientIana: "Europe/Moscow",
      lastRotationAt: null,
      now: new Date(),
    });
    expect(slots).toEqual([]);
  });
});
