"use client";

import { useEffect, useRef } from "react";
import { safeReload } from "@/shared/lib/safeReload";
import {
  AUTO_RELOAD_ENABLED,
  BUILD_ID_META_NAME,
  WATCHER_BASE_INTERVAL_MS,
  WATCHER_MAX_CONSECUTIVE_ERRORS,
  WATCHER_MAX_INTERVAL_MS,
} from "@/shared/lib/reloadConstants";

type VersionResponse = {
  buildId?: string;
};

function readInitialBuildId(): string {
  const meta = document.querySelector(`meta[name="${BUILD_ID_META_NAME}"]`);
  return meta?.getAttribute("content")?.trim() || "";
}

export function BuildVersionWatcher() {
  const initialBuildIdRef = useRef("");
  const inFlightRef = useRef(false);
  const intervalIdRef = useRef<number | null>(null);
  const backoffMsRef = useRef(WATCHER_BASE_INTERVAL_MS);
  const consecutiveErrorsRef = useRef(0);
  const stoppedUntilFocusRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!AUTO_RELOAD_ENABLED || typeof window === "undefined") return;
    initialBuildIdRef.current = readInitialBuildId();

    const clearLoop = () => {
      if (intervalIdRef.current !== null) {
        window.clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
    };

    const restartLoop = () => {
      clearLoop();
      if (document.visibilityState !== "visible") return;
      if (!navigator.onLine) return;
      intervalIdRef.current = window.setInterval(() => {
        void probeVersion();
      }, backoffMsRef.current);
    };

    const probeVersion = async () => {
      if (inFlightRef.current || document.visibilityState !== "visible" || !navigator.onLine) {
        return;
      }
      if (stoppedUntilFocusRef.current) return;

      inFlightRef.current = true;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      try {
        const response = await fetch("/api/version", {
          cache: "no-store",
          signal: controller.signal,
          headers: { pragma: "no-cache" },
        });
        if (!response.ok) {
          throw new Error(`version endpoint failed: ${response.status}`);
        }
        const payload = (await response.json()) as VersionResponse;
        const serverBuildId = (payload.buildId || "").trim();
        if (!serverBuildId) {
          consecutiveErrorsRef.current = 0;
          backoffMsRef.current = WATCHER_BASE_INTERVAL_MS;
          restartLoop();
          return;
        }
        // Dev/local: layout meta may be empty if BUILD_ID was not set at build time.
        // First successful response establishes baseline — otherwise "" !== server id loops reload forever.
        if (!initialBuildIdRef.current) {
          initialBuildIdRef.current = serverBuildId;
          consecutiveErrorsRef.current = 0;
          backoffMsRef.current = WATCHER_BASE_INTERVAL_MS;
          restartLoop();
          return;
        }
        if (serverBuildId !== initialBuildIdRef.current) {
          await safeReload("version-mismatch", serverBuildId);
          return;
        }
        consecutiveErrorsRef.current = 0;
        backoffMsRef.current = WATCHER_BASE_INTERVAL_MS;
        restartLoop();
      } catch {
        consecutiveErrorsRef.current += 1;
        backoffMsRef.current = Math.min(backoffMsRef.current * 2, WATCHER_MAX_INTERVAL_MS);
        if (consecutiveErrorsRef.current >= WATCHER_MAX_CONSECUTIVE_ERRORS) {
          stoppedUntilFocusRef.current = true;
          clearLoop();
        } else {
          restartLoop();
        }
      } finally {
        inFlightRef.current = false;
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "hidden") {
        controllerRef.current?.abort();
        clearLoop();
        return;
      }
      stoppedUntilFocusRef.current = false;
      void probeVersion();
      restartLoop();
    };

    const onFocus = () => {
      stoppedUntilFocusRef.current = false;
      void probeVersion();
      restartLoop();
    };

    const onOffline = () => {
      controllerRef.current?.abort();
      clearLoop();
    };

    const onOnline = () => {
      stoppedUntilFocusRef.current = false;
      void probeVersion();
      restartLoop();
    };

    restartLoop();
    void probeVersion();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      controllerRef.current?.abort();
      clearLoop();
    };
  }, []);

  return null;
}
