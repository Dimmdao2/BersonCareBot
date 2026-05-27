"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

/** History back с fallback на `fallbackHref`, если в истории некуда вернуться. */
export function usePatientShellGoBack(fallbackHref?: string) {
  const router = useRouter();

  return useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    if (fallbackHref) {
      router.push(fallbackHref);
    }
  }, [router, fallbackHref]);
}
