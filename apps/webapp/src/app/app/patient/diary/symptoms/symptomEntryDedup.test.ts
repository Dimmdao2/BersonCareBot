import { describe, expect, it } from "vitest";
import {
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
