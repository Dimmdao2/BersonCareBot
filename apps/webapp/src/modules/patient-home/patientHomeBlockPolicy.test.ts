import { describe, expect, it } from "vitest";
import { filterAndSortPatientHomeBlocks, isPatientHomePersonalBlock } from "./patientHomeBlockPolicy";
import type { PatientHomeBlock } from "./ports";

function block(
  code: PatientHomeBlock["code"],
  sortOrder: number,
  isVisible = true,
  items: PatientHomeBlock["items"] = [],
): PatientHomeBlock {
  return {
    code,
    title: code,
    description: "",
    isVisible,
    sortOrder,
    iconImageUrl: null,
    items,
  };
}

describe("patientHomeBlockPolicy", () => {
  it("marks personal block codes for gated UI (not used to hide blocks)", () => {
    expect(isPatientHomePersonalBlock("progress")).toBe(true);
    expect(isPatientHomePersonalBlock("mood_checkin")).toBe(true);
    expect(isPatientHomePersonalBlock("next_reminder")).toBe(true);
    expect(isPatientHomePersonalBlock("plan")).toBe(true);
    expect(isPatientHomePersonalBlock("booking")).toBe(false);
    expect(isPatientHomePersonalBlock("daily_warmup")).toBe(false);
  });

  it("sorts visible blocks by sortOrder", () => {
    const blocks = [block("situations", 30), block("booking", 20), block("daily_warmup", 10)];
    const sorted = filterAndSortPatientHomeBlocks(blocks).map((b) => b.code);
    expect(sorted).toEqual(["daily_warmup", "booking", "situations"]);
  });

  it("drops invisible blocks", () => {
    const blocks = [block("booking", 20, false), block("daily_warmup", 10, true)];
    const sorted = filterAndSortPatientHomeBlocks(blocks).map((b) => b.code);
    expect(sorted).toEqual(["daily_warmup"]);
  });

  it("does not filter personal blocks when tier is false (visibility is CMS-only)", () => {
    const blocks = [block("progress", 5), block("booking", 20), block("daily_warmup", 10)];
    const sorted = filterAndSortPatientHomeBlocks(blocks).map((b) => b.code);
    expect(sorted).toEqual(["progress", "daily_warmup", "booking"]);
  });
});
