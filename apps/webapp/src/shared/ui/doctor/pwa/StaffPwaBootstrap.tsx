"use client";

import { useEffect } from "react";
import { routePaths } from "@/app-layer/routes/paths";
import { isMessengerMiniAppHost } from "@/shared/lib/messengerMiniApp";
import { markStaffPwaInstalled } from "@/shared/lib/pwa/staffPwaInstallState";

/** Регистрация `public/sw.js` в staff shell (scope `/app`); без patient push. */
export function StaffPwaBootstrap() {
  useEffect(() => {
    const onAppInstalled = () => {
      markStaffPwaInstalled();
    };
    window.addEventListener("appinstalled", onAppInstalled);

    const t = window.setTimeout(() => {
      if (!isMessengerMiniAppHost() && "serviceWorker" in navigator) {
        void navigator.serviceWorker.register("/sw.js", { scope: routePaths.root }).catch(() => {});
      }
    }, 0);

    return () => {
      window.clearTimeout(t);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  return null;
}
