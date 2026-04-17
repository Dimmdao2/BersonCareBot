"use client";

import { useSyncExternalStore } from "react";

/** Tailwind `lg` breakpoint (1024px). */
const LG_QUERY = "(min-width: 1024px)";

function subscribeMinWidth1024(onStoreChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mq = window.matchMedia(LG_QUERY);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getMinWidth1024Snapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(LG_QUERY).matches;
}

function getServerSnapshotFalse(): boolean {
  return false;
}

/** True when viewport matches Tailwind `lg` and desktop split-pane branch should mount. */
export function useViewportMinWidthLg(): boolean {
  return useSyncExternalStore(subscribeMinWidth1024, getMinWidth1024Snapshot, getServerSnapshotFalse);
}
