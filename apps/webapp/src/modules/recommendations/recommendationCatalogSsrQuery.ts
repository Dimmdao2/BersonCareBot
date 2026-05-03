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
  /**
   * Непустой `?region=` — UUID (в каталоге допускается только код справочника, например `spine`).
   * На SSR — баннер; фильтр по региону на сервере не выполняется (только клиент по коду).
   */
  invalidRegionQuery: boolean;
  /** Код `body_region` из query для клиентского фильтра; `undefined` если пусто или UUID. */
  regionCodeForCatalog: string | undefined;
};

/**
 * Парсинг query каталога рекомендаций на SSR: allowlist для `domain`;
 * `region` — только код справочника (не UUID), для UI/клиента, не для `listRecommendations`.
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
    invalidRegionQuery: regionParsed.invalidRegionQuery,
    regionCodeForCatalog: regionParsed.regionCode,
  };
}
