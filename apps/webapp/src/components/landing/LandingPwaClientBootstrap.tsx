"use client";

import { useEffect } from "react";
import { isMessengerMiniAppHost } from "@/shared/lib/messengerMiniApp";

/**
 * Регистрация `public/sw.js` с главной `/` (scope = /app).
 * Не импортирует routePaths — клиентский бандл не тянет серверные модули.
 */
export function LandingPwaClientBootstrap() {
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!isMessengerMiniAppHost() && "serviceWorker" in navigator) {
        void navigator.serviceWorker.register("/sw.js", { scope: "/app" }).catch(() => {});
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}
