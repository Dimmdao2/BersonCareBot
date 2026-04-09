"use client";

import { useSyncExternalStore } from "react";

/**
 * Подписка на ширину окна: `true`, если `window.matchMedia(\`(min-width: ${minPx}px)\`)` совпал.
 * SSR-снимок `false` (узкий экран), чтобы гидрация не расходилась с типичным первым кадром на телефоне.
 */
export function useViewportMinWidth(minPx: number): boolean {
  const query = `(min-width: ${minPx}px)`;
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return () => {};
      }
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onStoreChange);
      return () => mq.removeEventListener("change", onStoreChange);
    },
    () => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
      return window.matchMedia(query).matches;
    },
    () => false,
  );
}
