"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DOCTOR_CATALOG_URL_SYNC_EVENT,
  readDoctorCatalogClientFilterUrlSlice,
  type DoctorCatalogClientFilterUrlSlice,
} from "@/shared/lib/doctorCatalogClientUrlSync";

/**
 * Объединяет server scope (`listStatus`, invalid* flags, …) с актуальными клиентскими
 * фильтрами из `window.location` без `router.replace` → без RSC refetch при смене q/region/load.
 */
export function useDoctorCatalogClientFilterMerge<S extends Record<string, unknown>>(
  serverScope: S,
): S & DoctorCatalogClientFilterUrlSlice {
  const [slice, setSlice] = useState<DoctorCatalogClientFilterUrlSlice>(() =>
    readDoctorCatalogClientFilterUrlSlice(),
  );

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
    const s = serverScope as S & {
      loadType?: DoctorCatalogClientFilterUrlSlice["loadType"];
      titleSort?: DoctorCatalogClientFilterUrlSlice["titleSort"];
      domain?: string;
      assessmentKind?: string;
    };
    return {
      ...s,
      q: slice.q,
      regionCode: slice.regionCode,
      invalidRegionQuery: slice.invalidRegionQuery,
      loadType: slice.loadType ?? s.loadType,
      titleSort: slice.titleSort ?? s.titleSort ?? null,
      domain: slice.domain ?? s.domain,
      assessmentKind: slice.assessmentKind ?? s.assessmentKind,
    } as S & DoctorCatalogClientFilterUrlSlice;
  }, [serverScope, slice]);
}
