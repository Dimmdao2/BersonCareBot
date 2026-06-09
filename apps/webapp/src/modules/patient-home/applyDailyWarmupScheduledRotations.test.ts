import { describe, expect, it } from "vitest";
import { applyDailyWarmupScheduledRotations } from "./applyDailyWarmupScheduledRotations";

const pages = [{ contentPageId: "a" }, { contentPageId: "b" }, { contentPageId: "c" }];

describe("applyDailyWarmupScheduledRotations", () => {
  it("advances on each slot", () => {
    const next = applyDailyWarmupScheduledRotations({
      pages,
      initialState: {
        contentPageId: "a",
        lastRotationAt: "2026-06-09T04:00:00.000Z",
        skipNextScheduledRotation: false,
      },
      slotInstants: ["2026-06-09T05:00:00.000Z", "2026-06-09T11:00:00.000Z"],
    });
    expect(next.contentPageId).toBe("c");
    expect(next.skipNextScheduledRotation).toBe(false);
  });

  it("skips one slot when flag set", () => {
    const next = applyDailyWarmupScheduledRotations({
      pages,
      initialState: {
        contentPageId: "a",
        lastRotationAt: "2026-06-09T04:00:00.000Z",
        skipNextScheduledRotation: true,
      },
      slotInstants: ["2026-06-09T05:00:00.000Z", "2026-06-09T11:00:00.000Z"],
    });
    expect(next.contentPageId).toBe("b");
    expect(next.skipNextScheduledRotation).toBe(false);
  });
});
