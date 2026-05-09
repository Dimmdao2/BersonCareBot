"use client";

import { useEffect, useState } from "react";

/**
 * Тот же порог, что и компактное меню {@link PatientTopNav}: после него скрывается
 * полоска заголовка под меню ({@link PatientShellPageTitleStrip}).
 */
export const PATIENT_SHELL_SCROLL_COMPACT_PX = 10;

/** `true`, когда страница прокручена ниже порога — компактное меню и скрытый подзаголовок. */
export function usePatientShellScrollCompact(): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > PATIENT_SHELL_SCROLL_COMPACT_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return compact;
}
