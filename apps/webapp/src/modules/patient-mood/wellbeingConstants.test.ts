import { describe, expect, it } from "vitest";
import {
  wellbeingResubmitKind,
  WELLBEING_MODAL_WINDOW_MAX_MS,
  WELLBEING_REPLACE_LAST_MAX_MS,
} from "./wellbeingConstants";

describe("wellbeingResubmitKind", () => {
  const nowMs = Date.parse("2026-06-01T10:00:00.000Z");

  it("≤10 min inclusive → replace_silent", () => {
    expect(wellbeingResubmitKind(new Date(nowMs - WELLBEING_REPLACE_LAST_MAX_MS).toISOString(), nowMs)).toBe(
      "replace_silent",
    );
  });

  it(">10 min → modal", () => {
    expect(wellbeingResubmitKind(new Date(nowMs - WELLBEING_REPLACE_LAST_MAX_MS - 1).toISOString(), nowMs)).toBe(
      "modal",
    );
  });

  it("≤60 min inclusive (and >10) → modal", () => {
    expect(wellbeingResubmitKind(new Date(nowMs - WELLBEING_MODAL_WINDOW_MAX_MS).toISOString(), nowMs)).toBe("modal");
  });

  it(">60 min → new_only", () => {
    expect(wellbeingResubmitKind(new Date(nowMs - WELLBEING_MODAL_WINDOW_MAX_MS - 1).toISOString(), nowMs)).toBe(
      "new_only",
    );
  });
});
