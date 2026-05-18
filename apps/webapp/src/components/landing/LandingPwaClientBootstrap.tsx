"use client";

import { useEffect } from "react";
import { routePaths } from "@/app-layer/routes/paths";
import { isMessengerMiniAppHost } from "@/shared/lib/messengerMiniApp";

/**
 * Регистрация `public/sw.js` с главной `/` (как в `PwaInstallSection`), без второго UI-блока установки.
 */
export function LandingPwaClientBootstrap() {
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!isMessengerMiniAppHost() && "serviceWorker" in navigator) {
        void navigator.serviceWorker.register("/sw.js", { scope: routePaths.root }).catch(() => {});
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}
