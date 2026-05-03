import { describe, expect, it } from "vitest";
import { coerceMaxPlanMutationCreatedAtToIso } from "./pgTreatmentProgramEvents";

describe("coerceMaxPlanMutationCreatedAtToIso (A5 POST-AUDIT)", () => {
  it("returns trimmed ISO string", () => {
    expect(coerceMaxPlanMutationCreatedAtToIso(" 2026-05-03T12:00:00.000Z ")).toBe("2026-05-03T12:00:00.000Z");
  });

  it("coerces Date to ISO string", () => {
    const d = new Date("2026-05-03T12:00:00.000Z");
    expect(coerceMaxPlanMutationCreatedAtToIso(d)).toBe("2026-05-03T12:00:00.000Z");
  });

  it("returns null for empty or invalid", () => {
    expect(coerceMaxPlanMutationCreatedAtToIso(null)).toBeNull();
    expect(coerceMaxPlanMutationCreatedAtToIso("")).toBeNull();
    expect(coerceMaxPlanMutationCreatedAtToIso("   ")).toBeNull();
    expect(coerceMaxPlanMutationCreatedAtToIso(123)).toBeNull();
  });
});
