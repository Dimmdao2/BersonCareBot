"use client";

import { useEffect, useRef } from "react";

/**
 * Интервальный опрос (например для новых сообщений). Интервал активен только пока
 * `document.visibilityState === "visible"`. При уходе на другую вкладку интервал
 * снимается; при возврате — запускается заново и немедленно стреляет один раз.
 */
export function useMessagePolling(onTick: () => void | Promise<void>, enabled: boolean, intervalMs = 16000) {
  const ref = useRef(onTick);
  useEffect(() => {
    ref.current = onTick;
  });

  useEffect(() => {
    if (!enabled) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startInterval = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      void ref.current();
      intervalId = setInterval(() => void ref.current(), intervalMs);
    };

    const stopInterval = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        startInterval();
      } else {
        stopInterval();
      }
    };

    if (document.visibilityState === "visible") {
      startInterval();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopInterval();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, intervalMs]);
}
