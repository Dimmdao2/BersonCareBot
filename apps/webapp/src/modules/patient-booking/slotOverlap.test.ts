import { describe, expect, it } from "vitest";
import { intervalsOverlap } from "./slotOverlap";

describe("intervalsOverlap", () => {
  it("detects overlap for half-open ranges", () => {
    expect(
      intervalsOverlap("2026-04-02T10:00:00.000Z", "2026-04-02T11:00:00.000Z", "2026-04-02T10:30:00.000Z", "2026-04-02T11:30:00.000Z"),
    ).toBe(true);
  });

  it("no overlap when ranges touch at boundary [10,11) and [11,12)", () => {
    expect(
      intervalsOverlap("2026-04-02T10:00:00.000Z", "2026-04-02T11:00:00.000Z", "2026-04-02T11:00:00.000Z", "2026-04-02T12:00:00.000Z"),
    ).toBe(false);
  });
});
