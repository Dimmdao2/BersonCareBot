import { describe, expect, it } from "vitest";
import {
  getUtcDayRange,
  hasInstantDuplicateInWindow,
  SYMPTOM_INSTANT_DEDUP_MS,
  shouldConfirmInstantDuplicate,
  type LastSymptomSaveMeta,
} from "./symptomEntryDedup";

describe("shouldConfirmInstantDuplicate (I.6)", () => {
  it("returns false when no previous save", () => {
    expect(shouldConfirmInstantDuplicate(null, "t1", "instant")).toBe(false);
  });

  it("returns true for same tracking + instant within window", () => {
    const last: LastSymptomSaveMeta = {
      trackingId: "t1",
      entryType: "instant",
      at: Date.now() - 30_000,
    };
    expect(shouldConfirmInstantDuplicate(last, "t1", "instant")).toBe(true);
  });

  it("returns false for daily after instant (different type)", () => {
    const last: LastSymptomSaveMeta = {
      trackingId: "t1",
      entryType: "instant",
      at: Date.now() - 30_000,
    };
    expect(shouldConfirmInstantDuplicate(last, "t1", "daily")).toBe(false);
  });

  it("returns false after window elapsed", () => {
    const last: LastSymptomSaveMeta = {
      trackingId: "t1",
      entryType: "instant",
      at: Date.now() - SYMPTOM_INSTANT_DEDUP_MS - 1000,
    };
    expect(shouldConfirmInstantDuplicate(last, "t1", "instant")).toBe(false);
  });

  it("returns false for different tracking", () => {
    const last: LastSymptomSaveMeta = {
      trackingId: "t1",
      entryType: "instant",
      at: Date.now() - 10_000,
    };
    expect(shouldConfirmInstantDuplicate(last, "t2", "instant")).toBe(false);
  });
});

describe("hasInstantDuplicateInWindow", () => {
  it("returns true when same value and notes are saved in dedup window", () => {
    const now = Date.now();
    const entries = [
      {
        entryType: "instant" as const,
        value0_10: 7,
        notes: "утро",
        recordedAt: new Date(now - 20_000).toISOString(),
      },
    ];
    expect(
      hasInstantDuplicateInWindow(entries, {
        recordedAtMs: now,
        value0_10: 7,
        notes: "утро",
      }),
    ).toBe(true);
  });

  it("returns false when value differs", () => {
    const now = Date.now();
    const entries = [
      {
        entryType: "instant" as const,
        value0_10: 6,
        notes: "утро",
        recordedAt: new Date(now - 20_000).toISOString(),
      },
    ];
    expect(
      hasInstantDuplicateInWindow(entries, {
        recordedAtMs: now,
        value0_10: 7,
        notes: "утро",
      }),
    ).toBe(false);
  });

  it("returns false when only daily entry exists", () => {
    const now = Date.now();
    const entries = [
      {
        entryType: "daily" as const,
        value0_10: 7,
        notes: "утро",
        recordedAt: new Date(now - 20_000).toISOString(),
      },
    ];
    expect(
      hasInstantDuplicateInWindow(entries, {
        recordedAtMs: now,
        value0_10: 7,
        notes: "утро",
      }),
    ).toBe(false);
  });
});

describe("getUtcDayRange", () => {
  it("returns UTC day bounds", () => {
    const at = Date.parse("2026-03-29T14:20:00.000Z");
    expect(getUtcDayRange(at)).toEqual({
      fromRecordedAt: "2026-03-29T00:00:00.000Z",
      toRecordedAtExclusive: "2026-03-30T00:00:00.000Z",
    });
  });
});
