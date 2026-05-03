import { z } from "zod";
import type { ReferenceItem } from "@/modules/references/types";
import { parseRecommendationDomain, type RecommendationDomain } from "./recommendationDomain";

export type RecommendationCatalogSsrParsed = {
  /** Значение для `listRecommendations({ domain })`; `null` = без фильтра по типу. */
  domainForList: RecommendationDomain | null;
  /** Значение для `listRecommendations({ regionRefId })`; `null` = без фильтра по региону. */
  regionRefIdForList: string | null;
  /**
   * Непустой `?domain=` не входит в allowlist (активные `reference_items` категории `recommendation_type` или сид v1).
   * На SSR фильтр по типу **не** применяется (`domainForList === null`), страница рендерится; UI может показать баннер.
   * В отличие от этого, `GET /api/doctor/recommendations` при том же невалидном коде возвращает **`400`**
   * `{ ok:false, error:"invalid_query", field:"domain" }` (JSON API).
   */
  invalidDomainQuery: boolean;
  /**
   * Непустой `?regionRefId=` не UUID — фильтр по региону не применяется.
   */
  invalidRegionQuery: boolean;
};

/**
 * Парсинг query каталога рекомендаций на SSR: та же логика allowlist/UUID, что и у `GET /api/doctor/recommendations`,
 * для передачи в `listRecommendations` (невалидные части query не попадают в фильтр списка).
 * HTTP-ответ страницы при невалидных query **не** `400` — см. описание флагов `invalidDomainQuery` / `invalidRegionQuery`.
 *
 * @param sp — `{ regionRefId, domain }`: `regionRefId` — UUID из query (`?regionRefId=`).
 */
export function parseRecommendationCatalogSsrQuery(
  sp: {
    regionRefId?: string;
    domain?: string;
  },
  refItems: ReferenceItem[],
): RecommendationCatalogSsrParsed {
  const regionRaw = typeof sp.regionRefId === "string" ? sp.regionRefId.trim() : "";
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
