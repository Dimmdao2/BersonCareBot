"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { usePatientShellScrollCompact } from "@/shared/hooks/usePatientShellScrollCompact";

/**
 * Полоска заголовка под {@link PatientTopNav}: при прокрутке вниз схлопывается,
 * при возврате страницы наверх — снова видна (тот же порог скролла, что компактное меню).
 */
export function PatientShellPageTitleStrip({ children }: { children: ReactNode }) {
  const compactScroll = usePatientShellScrollCompact();
  const show = !compactScroll;

  return (
    <div
      data-testid="patient-shell-page-title-wrap"
      className={cn(
        "grid shrink-0 transition-[grid-template-rows] duration-300 ease-in-out",
        show ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
      )}
      aria-hidden={!show}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          className={cn(
            "border-b border-[var(--patient-border)] bg-[var(--patient-page-bg)] px-4 py-3",
            !show && "pointer-events-none",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
