import { z } from "zod";
import type { ReferenceItem } from "@/modules/references/types";
import { parseRecommendationDomain, type RecommendationDomain } from "./recommendationDomain";

export type RecommendationCatalogSsrParsed = {
  /** Значение для `listRecommendations({ domain })`; `null` = без фильтра по типу. */
  domainForList: RecommendationDomain | null;
  /** Значение для `listRecommendations({ regionRefId })`; `null` = без фильтра по региону. */
  regionRefIdForList: string | null;
  /** Непустой `?domain=` не распознан как код из allowlist — фильтр по типу не применяется (как `GET /api/doctor/recommendations`). */
  invalidDomainQuery: boolean;
  /** Непустой `?region=` не UUID — фильтр по региону не применяется (как `GET /api/doctor/recommendations`). */
  invalidRegionQuery: boolean;
};

/**
 * Парсинг query каталога рекомендаций на SSR: согласован с валидацией
 * `GET /api/doctor/recommendations` (невалидные части не передаются в список).
 */
export function parseRecommendationCatalogSsrQuery(
  sp: {
    region?: string;
    domain?: string;
  },
  refItems: ReferenceItem[],
): RecommendationCatalogSsrParsed {
  const regionRaw = typeof sp.region === "string" ? sp.region.trim() : "";
  const regionUuidOk = !regionRaw || z.string().uuid().safeParse(regionRaw).success;
  const invalidRegionQuery = Boolean(regionRaw) && !regionUuidOk;
  const regionRefIdForList = regionRaw && regionUuidOk ? regionRaw : null;

  const domainRaw = typeof sp.domain === "string" ? sp.domain.trim() : "";
  const domainParsed = domainRaw ? parseRecommendationDomain(domainRaw, refItems) : undefined;
  const invalidDomainQuery = domainRaw !== "" && domainParsed === undefined;
  const domainForList = invalidDomainQuery ? null : (domainParsed ?? null);

  return {
    domainForList,
    regionRefIdForList,
    invalidDomainQuery,
    invalidRegionQuery,
  };
}
