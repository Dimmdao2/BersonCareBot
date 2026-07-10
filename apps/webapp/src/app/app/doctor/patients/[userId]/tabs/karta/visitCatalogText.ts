import type { Recommendation } from "@/modules/recommendations/types";

export const VISIT_MANIPULATION_REFERENCE_CATEGORY_CODE = "visit_manipulation";

export type VisitCatalogOption = {
  id: string;
  title: string;
  body?: string | null;
  meta?: string | null;
};

function normalizeTextPart(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function appendVisitCatalogText(current: string, optionText: string): string {
  const next = optionText.trim().replace(/\r\n/g, "\n");
  if (!next) return current;
  const currentText = current.trim().replace(/\r\n/g, "\n");
  if (
    currentText === next ||
    currentText.startsWith(`${next}\n`) ||
    currentText.endsWith(`\n${next}`) ||
    currentText.includes(`\n${next}\n`)
  ) {
    return current;
  }
  const prev = current.trimEnd();
  return prev ? `${prev}\n${next}` : next;
}

export function formatRecommendationForVisit(option: Recommendation): VisitCatalogOption {
  const metaParts = [
    normalizeTextPart(option.quantityText),
    normalizeTextPart(option.frequencyText),
    normalizeTextPart(option.durationText),
  ].filter(Boolean);
  const body = normalizeTextPart(option.bodyMd);
  return {
    id: option.id,
    title: option.title,
    body: body || null,
    meta: metaParts.length > 0 ? metaParts.join(" · ") : null,
  };
}

export function visitCatalogOptionToText(option: VisitCatalogOption): string {
  return [option.title.trim(), normalizeTextPart(option.meta), normalizeTextPart(option.body)]
    .filter(Boolean)
    .join("\n");
}
