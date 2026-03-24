"use client";

import { useEffect, useRef } from "react";

/**
 * Интервальный опрос (например для новых сообщений). Запросы выполняются только при
 * `document.visibilityState === "visible"`, чтобы не создавать шторм при неактивной вкладке.
 */
export function useMessagePolling(onTick: () => void | Promise<void>, enabled: boolean, intervalMs = 16000) {
  const ref = useRef(onTick);
  useEffect(() => {
    ref.current = onTick;
  });

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void ref.current();
    };
    const id = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [enabled, intervalMs]);
}
