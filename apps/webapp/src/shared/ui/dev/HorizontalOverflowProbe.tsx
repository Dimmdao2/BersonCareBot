"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { runHorizontalOverflowProbe } from "@/shared/lib/dev/horizontalOverflowProbe";

const PROBE_DEBOUNCE_MS = 200;

function logProbe(context: string): void {
  const result = runHorizontalOverflowProbe();
  const hasIssue =
    result.documentScrollOverflow || result.offenders.length > 0;
  if (!hasIssue) return;

  console.warn("[pwa-overflow]", context, {
    viewportWidth: result.viewportWidth,
    documentScrollOverflow: result.documentScrollOverflow,
    offenderCount: result.offenders.length,
    offenders: result.offenders.slice(0, 12),
  });
}

/**
 * Dev-only: после смены маршрута и появления порталов (модалки) логирует элементы,
 * выходящие за visual viewport по горизонтали.
 */
export function HorizontalOverflowProbe() {
  const pathname = usePathname();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const schedule = (reason: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        logProbe(reason);
      }, PROBE_DEBOUNCE_MS);
    };

    schedule(`route:${pathname ?? "/"}`);

    const observer = new MutationObserver(() => {
      schedule("dom-mutation");
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-open", "data-state", "data-ending-style", "data-starting-style"],
    });

    const onResize = () => schedule("resize");
    window.visualViewport?.addEventListener("resize", onResize);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      observer.disconnect();
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, [pathname]);

  return null;
}
