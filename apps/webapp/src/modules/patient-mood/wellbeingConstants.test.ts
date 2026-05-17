import { describe, expect, it } from "vitest";
import { wellbeingResubmitKind, WELLBEING_REPLACE_LAST_MAX_MS } from "./wellbeingConstants";

describe("wellbeingResubmitKind", () => {
  it("≤5 min → replace_silent (client hint; сервер решает add vs replace)", () => {
    const nowMs = Date.parse("2026-05-08T12:00:00.000Z");
    expect(wellbeingResubmitKind(new Date(nowMs - WELLBEING_REPLACE_LAST_MAX_MS).toISOString(), nowMs)).toBe(
      "replace_silent",
    );
  });

  it(">5 min → new_only", () => {
    const nowMs = Date.parse("2026-05-08T12:00:00.000Z");
    expect(wellbeingResubmitKind(new Date(nowMs - WELLBEING_REPLACE_LAST_MAX_MS - 1).toISOString(), nowMs)).toBe(
      "new_only",
    );
  });
});
