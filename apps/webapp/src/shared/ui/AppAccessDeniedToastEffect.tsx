"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  searchParamsHasAccessDeniedToast,
  showAppAccessDeniedToastIfFlagged,
  stripAccessDeniedToastFromUrl,
} from "@/shared/lib/appAccessDeniedToast";

/**
 * Одноразовый toast при cross-zone block (волна 2): читает `app_access_denied`, показывает toast, убирает query.
 */
export function AppAccessDeniedToastEffect() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const handledKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!searchParamsHasAccessDeniedToast(searchParams)) {
      handledKeyRef.current = null;
      return;
    }

    const search = searchParams.toString();
    const fullSearch = search ? `?${search}` : "";
    const key = `${pathname}${fullSearch}`;
    if (handledKeyRef.current === key) return;
    handledKeyRef.current = key;

    showAppAccessDeniedToastIfFlagged(searchParams);
    const stripped = stripAccessDeniedToastFromUrl(pathname, fullSearch);
    router.replace(`${stripped.pathname}${stripped.search}`);
  }, [pathname, router, searchParams]);

  return null;
}
