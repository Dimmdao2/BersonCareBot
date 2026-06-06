"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  parseReturnToPath,
  searchParamsHasAccessDeniedToast,
  searchParamsHasAccessDeniedToastInNext,
  showAppAccessDeniedToastIfFlagged,
  stripAccessDeniedToastFromNextParam,
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
    const search = searchParams.toString();
    const fullSearch = search ? `?${search}` : "";
    const nextParam = searchParams.get("next");
    const hasDirectFlag = searchParamsHasAccessDeniedToast(searchParams);
    const hasNextFlag = searchParamsHasAccessDeniedToastInNext(nextParam);

    if (!hasDirectFlag && !hasNextFlag) {
      handledKeyRef.current = null;
      return;
    }

    const key = `${pathname}${fullSearch}`;
    if (handledKeyRef.current === key) return;
    handledKeyRef.current = key;

    if (hasDirectFlag) {
      showAppAccessDeniedToastIfFlagged(searchParams);
      const stripped = stripAccessDeniedToastFromUrl(pathname, fullSearch);
      router.replace(`${stripped.pathname}${stripped.search}`);
      return;
    }

    if (hasNextFlag && nextParam) {
      const parsedNext = parseReturnToPath(nextParam);
      showAppAccessDeniedToastIfFlagged(parsedNext?.search);
      const params = new URLSearchParams(searchParams.toString());
      params.set("next", stripAccessDeniedToastFromNextParam(nextParam));
      const hash = typeof window !== "undefined" ? window.location.hash : "";
      router.replace(`${pathname}?${params.toString()}${hash}`);
    }
  }, [pathname, router, searchParams]);

  return null;
}
