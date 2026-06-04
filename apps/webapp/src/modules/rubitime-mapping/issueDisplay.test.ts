import { describe, expect, it } from "vitest";
import {
  formatMappingIssueLines,
  formatPriceMinorRub,
  mappingRowBadgeLabel,
  mappingRowHasProblems,
  mappingRowStatusTone,
  problemsSummaryBanner,
} from "./issueDisplay";
import type { RubitimeMappingRow } from "./types";

const baseRow: RubitimeMappingRow = {
  branchId: "b1",
  branchTitle: "Москва",
  serviceId: "s1",
  serviceTitle: "Сеанс 60 мин",
  rubitimeBranchTitle: "Москва",
  rubitimeSpecialistName: "Берсон",
  rubitimeServiceTitle: "Сеанс 60 мин",
  status: "mapped_ok",
  issues: [],
  branchServiceId: "bs-1",
};

describe("rubitime mapping issue display", () => {
  it("treats mapped_ok with issues as a problem row", () => {
    const row = { ...baseRow, issues: ["price_mismatch"] };
    expect(mappingRowHasProblems(row)).toBe(true);
    expect(mappingRowStatusTone(row)).toBe("urgent");
    expect(mappingRowBadgeLabel(row)).toBe("Нужно исправить");
  });

  it("formats price mismatch with rub amounts", () => {
    const lines = formatMappingIssueLines({
      ...baseRow,
      issues: ["price_mismatch"],
      issueDetails: {
        priceMismatch: { canonicalPriceMinor: 700_000, legacyPriceMinor: 600_000 },
      },
    });
    expect(lines[0]).toMatch(/7[\s\u00a0]?000/);
    expect(lines[0]).toMatch(/6[\s\u00a0]?000/);
    expect(formatPriceMinorRub(700_000)).toMatch(/7[\s\u00a0]?000 ₽/);
  });

  it("includes blocker status when not mapped_ok", () => {
    const lines = formatMappingIssueLines({ ...baseRow, status: "unmapped", branchServiceId: null });
    expect(lines[0]).toBe("Не настроено");
  });

  it("builds problems summary banner", () => {
    expect(problemsSummaryBanner(0)).toBeNull();
    expect(problemsSummaryBanner(2)).toContain("2 связи");
  });
});
