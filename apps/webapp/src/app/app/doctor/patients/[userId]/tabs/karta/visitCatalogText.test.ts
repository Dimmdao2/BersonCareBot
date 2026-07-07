import { describe, expect, it } from "vitest";
import type { Recommendation } from "@/modules/recommendations/types";
import {
  appendVisitCatalogText,
  formatRecommendationForVisit,
  visitCatalogOptionToText,
} from "./visitCatalogText";

const baseRecommendation: Recommendation = {
  id: "rec-1",
  title: "Ходьба",
  bodyMd: "20 минут в комфортном темпе",
  media: [],
  domain: "regimen",
  bodyRegionId: null,
  bodyRegionIds: [],
  quantityText: "1 раз",
  frequencyText: "ежедневно",
  durationText: "2 недели",
  tags: null,
  isArchived: false,
  createdBy: null,
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
};

describe("visit catalog text helpers", () => {
  it("formats recommendation title, metrics and body for visit text", () => {
    expect(visitCatalogOptionToText(formatRecommendationForVisit(baseRecommendation))).toBe(
      "Ходьба\n1 раз · ежедневно · 2 недели\n20 минут в комфортном темпе",
    );
  });

  it("omits blank recommendation metrics and body", () => {
    const option = formatRecommendationForVisit({
      ...baseRecommendation,
      bodyMd: "   ",
      quantityText: null,
      frequencyText: "",
      durationText: null,
    });
    expect(visitCatalogOptionToText(option)).toBe("Ходьба");
  });

  it("appends selected catalog text after existing free text", () => {
    expect(appendVisitCatalogText("Свободная строка  ", "Справочник")).toBe(
      "Свободная строка\nСправочник",
    );
  });

  it("does not append an already selected catalog block twice", () => {
    const selected = "Ходьба\n1 раз · ежедневно · 2 недели\n20 минут";
    expect(appendVisitCatalogText(`Свободная строка\n${selected}`, selected)).toBe(
      `Свободная строка\n${selected}`,
    );
  });

  it("keeps current text when selected catalog text is blank", () => {
    expect(appendVisitCatalogText("Свободная строка", "  ")).toBe("Свободная строка");
  });
});
