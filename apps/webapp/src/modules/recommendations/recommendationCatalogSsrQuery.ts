import type { ReferenceItem } from "@/modules/references/types";
import { parseDoctorCatalogRegionQueryParam } from "@/shared/lib/doctorCatalogRegionQuery";
import { parseRecommendationDomain, type RecommendationDomain } from "./recommendationDomain";

export type RecommendationCatalogSsrParsed = {
  /** Значение для `listRecommendations({ domain })`; `null` = без фильтра по типу. */
  domainForList: RecommendationDomain | null;
  /**
   * Непустой `?domain=` не входит в allowlist (активные `reference_items` категории `recommendation_type` или сид v1).
   * На SSR фильтр по типу **не** применяется (`domainForList === null`), страница рендерится; UI может показать баннер.
   * В отличие от этого, `GET /api/doctor/recommendations` при том же невалидном коде возвращает **`400`**
   * `{ ok:false, error:"invalid_query", field:"domain" }` (JSON API).
   */
  invalidDomainQuery: boolean;
  /** Код `body_region` из query для клиентского фильтра; `undefined` если пусто или не проходит контракт кода. */
  regionCodeForCatalog: string | undefined;
};

/**
 * Парсинг query каталога рекомендаций на SSR: allowlist для `domain`;
 * `region` — код `body_region` (не UUID). На странице каталога uuid для `listRecommendations({ regionRefId })`
 * выводится через {@link resolveBodyRegionRefIdFromCatalogCode} после загрузки активных `body_region`.
 */
export function parseRecommendationCatalogSsrQuery(
  sp: {
    region?: string;
    domain?: string;
  },
  refItems: ReferenceItem[],
): RecommendationCatalogSsrParsed {
  const regionParsed = parseDoctorCatalogRegionQueryParam(sp.region);

  const domainRaw = typeof sp.domain === "string" ? sp.domain.trim() : "";
  const domainParsed = domainRaw ? parseRecommendationDomain(domainRaw, refItems) : undefined;
  const invalidDomainQuery = domainRaw !== "" && domainParsed === undefined;
  const domainForList = invalidDomainQuery ? null : (domainParsed ?? null);

  return {
    domainForList,
    invalidDomainQuery,
    regionCodeForCatalog: regionParsed.regionCode,
  };
}
