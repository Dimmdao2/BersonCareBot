import { describe, expect, it } from "vitest";
import { filterAndSortPatientHomeBlocks, shouldRenderPatientHomeBlock } from "./patientHomeBlockPolicy";
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
  it("hides personal blocks when personalTierOk is false", () => {
    expect(shouldRenderPatientHomeBlock("progress", false)).toBe(false);
    expect(shouldRenderPatientHomeBlock("mood_checkin", false)).toBe(false);
    expect(shouldRenderPatientHomeBlock("next_reminder", false)).toBe(false);
    expect(shouldRenderPatientHomeBlock("plan", false)).toBe(false);
    expect(shouldRenderPatientHomeBlock("booking", false)).toBe(true);
    expect(shouldRenderPatientHomeBlock("daily_warmup", false)).toBe(true);
  });

  it("shows personal blocks when personalTierOk is true", () => {
    expect(shouldRenderPatientHomeBlock("progress", true)).toBe(true);
    expect(shouldRenderPatientHomeBlock("plan", true)).toBe(true);
  });

  it("sorts visible blocks by sortOrder", () => {
    const blocks = [block("situations", 30), block("booking", 20), block("daily_warmup", 10)];
    const sorted = filterAndSortPatientHomeBlocks(blocks, true).map((b) => b.code);
    expect(sorted).toEqual(["daily_warmup", "booking", "situations"]);
  });

  it("drops invisible blocks", () => {
    const blocks = [block("booking", 20, false), block("daily_warmup", 10, true)];
    const sorted = filterAndSortPatientHomeBlocks(blocks, true).map((b) => b.code);
    expect(sorted).toEqual(["daily_warmup"]);
  });

  it("filters personal blocks for non-tier before sort", () => {
    const blocks = [block("progress", 5), block("booking", 20), block("daily_warmup", 10)];
    const sorted = filterAndSortPatientHomeBlocks(blocks, false).map((b) => b.code);
    expect(sorted).toEqual(["daily_warmup", "booking"]);
  });
});
