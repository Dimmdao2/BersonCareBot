"use client";

import { useLayoutEffect, type RefObject } from "react";

/** Пишет высоту chrome-элемента в CSS-переменную на `<html>` (для spacer / iframe calc). */
export function useReportShellChromeHeight(
  ref: RefObject<HTMLElement | null>,
  cssVarName: string,
): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const setVar = () => {
      document.documentElement.style.setProperty(cssVarName, `${el.offsetHeight}px`);
    };
    setVar();
    if (typeof ResizeObserver === "undefined") {
      return () => {
        document.documentElement.style.removeProperty(cssVarName);
      };
    }
    const ro = new ResizeObserver(setVar);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty(cssVarName);
    };
  }, [ref, cssVarName]);
}
