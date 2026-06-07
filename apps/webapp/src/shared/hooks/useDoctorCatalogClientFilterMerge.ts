"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DOCTOR_CATALOG_URL_SYNC_EVENT,
  emptyDoctorCatalogClientFilterUrlSlice,
  readDoctorCatalogClientFilterUrlSlice,
  type DoctorCatalogClientFilterUrlSlice,
} from "@/shared/lib/doctorCatalogClientUrlSync";

type ServerScopeWithUrlHints = {
  q?: string;
  regionCode?: string;
  loadType?: DoctorCatalogClientFilterUrlSlice["loadType"];
  titleSort?: DoctorCatalogClientFilterUrlSlice["titleSort"];
  domain?: string;
  assessmentKind?: string;
  hasRegionParam?: boolean;
  hasLoadParam?: boolean;
  hasTitleSortParam?: boolean;
  hasDomainParam?: boolean;
  hasAssessmentParam?: boolean;
};

function buildInitialSliceFromServerScope(serverScope: ServerScopeWithUrlHints): DoctorCatalogClientFilterUrlSlice {
  const base = emptyDoctorCatalogClientFilterUrlSlice();
  return {
    ...base,
    q: typeof serverScope.q === "string" ? serverScope.q : "",
    regionCode: serverScope.hasRegionParam ? serverScope.regionCode : undefined,
    loadType: serverScope.hasLoadParam ? serverScope.loadType : undefined,
    titleSort: serverScope.hasTitleSortParam ? (serverScope.titleSort ?? null) : null,
    domain: serverScope.hasDomainParam ? serverScope.domain : undefined,
    assessmentKind: serverScope.hasAssessmentParam ? serverScope.assessmentKind : undefined,
    hasRegionParam: Boolean(serverScope.hasRegionParam),
    hasLoadParam: Boolean(serverScope.hasLoadParam),
    hasTitleSortParam: Boolean(serverScope.hasTitleSortParam),
    hasDomainParam: Boolean(serverScope.hasDomainParam),
    hasAssessmentParam: Boolean(serverScope.hasAssessmentParam),
  };
}

/**
 * Объединяет server scope (`listStatus`, invalid* flags, …) с актуальными клиентскими
 * фильтрами из `window.location` без `router.replace` → без RSC refetch при смене q/region/load.
 */
export function useDoctorCatalogClientFilterMerge<S extends Record<string, unknown>>(
  serverScope: S,
): S & DoctorCatalogClientFilterUrlSlice {
  const [slice, setSlice] = useState<DoctorCatalogClientFilterUrlSlice>(() => {
    if (typeof window !== "undefined") {
      return readDoctorCatalogClientFilterUrlSlice();
    }
    return buildInitialSliceFromServerScope(serverScope as ServerScopeWithUrlHints);
  });

  useEffect(() => {
    const sync = () => {
      setSlice(readDoctorCatalogClientFilterUrlSlice());
    };
    sync();
    window.addEventListener(DOCTOR_CATALOG_URL_SYNC_EVENT, sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener(DOCTOR_CATALOG_URL_SYNC_EVENT, sync);
      window.removeEventListener("popstate", sync);
    };
  }, [serverScope]);

  return useMemo(() => {
    const s = serverScope as S & ServerScopeWithUrlHints;
    return {
      ...s,
      q: slice.q,
      regionCode: slice.hasRegionParam ? slice.regionCode : undefined,
      loadType: slice.hasLoadParam ? slice.loadType : undefined,
      titleSort: slice.hasTitleSortParam ? slice.titleSort : null,
      domain: slice.hasDomainParam ? slice.domain : undefined,
      assessmentKind: slice.hasAssessmentParam ? slice.assessmentKind : undefined,
      hasRegionParam: slice.hasRegionParam,
      hasLoadParam: slice.hasLoadParam,
      hasTitleSortParam: slice.hasTitleSortParam,
      hasDomainParam: slice.hasDomainParam,
      hasAssessmentParam: slice.hasAssessmentParam,
    } as S & DoctorCatalogClientFilterUrlSlice;
  }, [serverScope, slice]);
}
