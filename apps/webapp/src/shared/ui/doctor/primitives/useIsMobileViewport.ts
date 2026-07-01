"use client";

import { useSyncExternalStore } from "react";

/** Телефон/таблет: узкий экран ИЛИ тач-устройство. */
const MOBILE_QUERY = "(max-width: 767px), (pointer: coarse)";

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

/**
 * Единая точка определения «мобильного» вьюпорта (desktop ⇄ bottom-sheet).
 * SSR/первый кадр → false (десктоп), затем гидрация уточняет.
 */
export function useIsMobileViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
