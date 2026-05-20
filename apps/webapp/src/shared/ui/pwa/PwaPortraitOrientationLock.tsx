"use client";

import { useEffect, useRef } from "react";
import { isStandalonePwa } from "@/shared/lib/webPush/pwaDisplay";
import {
  clearPwaPortraitOrientationLockAttributes,
  syncPwaPortraitOrientationLock,
  tryUnlockOrientation,
} from "@/shared/lib/pwa/pwaPortraitOrientationLock";

/** Portrait lock for installed patient PWA; native video fullscreen may rotate (platform-dependent). */
export function PwaPortraitOrientationLock() {
  const webkitVideoFullscreenRef = useRef(false);

  useEffect(() => {
    if (!isStandalonePwa()) return;

    document.documentElement.dataset.pwaPortraitLock = "1";

    const sync = () => {
      void syncPwaPortraitOrientationLock({
        webkitVideoFullscreen: webkitVideoFullscreenRef.current,
      });
    };

    const onWebkitBeginFullscreen = (event: Event) => {
      if (!(event.target instanceof HTMLVideoElement)) return;
      webkitVideoFullscreenRef.current = true;
      sync();
    };

    const onWebkitEndFullscreen = (event: Event) => {
      if (!(event.target instanceof HTMLVideoElement)) return;
      webkitVideoFullscreenRef.current = false;
      sync();
    };

    sync();
    window.addEventListener("orientationchange", sync);
    window.addEventListener("resize", sync);
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitbeginfullscreen", onWebkitBeginFullscreen, true);
    document.addEventListener("webkitendfullscreen", onWebkitEndFullscreen, true);

    return () => {
      webkitVideoFullscreenRef.current = false;
      tryUnlockOrientation();
      clearPwaPortraitOrientationLockAttributes();
      window.removeEventListener("orientationchange", sync);
      window.removeEventListener("resize", sync);
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitbeginfullscreen", onWebkitBeginFullscreen, true);
      document.removeEventListener("webkitendfullscreen", onWebkitEndFullscreen, true);
    };
  }, []);

  return null;
}
