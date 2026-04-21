import type { ReferenceItemDto } from "@/modules/references/referenceCache";

/** Коды сохраняются в БД и в query `domain=`. */
export const RECOMMENDATION_DOMAIN_CODES = [
  "exercise_technique",
  "nutrition",
  "daily_activity",
  "physiotherapy",
  "motivation",
  "safety",
] as const;

export type RecommendationDomain = (typeof RECOMMENDATION_DOMAIN_CODES)[number];

export const RECOMMENDATION_DOMAIN_ITEMS: ReferenceItemDto[] = [
  { id: "rec-dom-exercise_technique", code: "exercise_technique", title: "Техника упражнений", sortOrder: 1 },
  { id: "rec-dom-nutrition", code: "nutrition", title: "Питание", sortOrder: 2 },
  { id: "rec-dom-daily_activity", code: "daily_activity", title: "Бытовая активность", sortOrder: 3 },
  { id: "rec-dom-physiotherapy", code: "physiotherapy", title: "Физиотерапия", sortOrder: 4 },
  { id: "rec-dom-motivation", code: "motivation", title: "Мотивация", sortOrder: 5 },
  { id: "rec-dom-safety", code: "safety", title: "Техника безопасности", sortOrder: 6 },
];

export function recommendationDomainTitle(code: RecommendationDomain | undefined | null): string {
  if (!code) return "";
  return RECOMMENDATION_DOMAIN_ITEMS.find((i) => i.code === code)?.title ?? "";
}

export function parseRecommendationDomain(
  raw: string | undefined,
): RecommendationDomain | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const t = raw.trim();
  return (RECOMMENDATION_DOMAIN_CODES as readonly string[]).includes(t) ? (t as RecommendationDomain) : undefined;
}
