"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { usePatientShellScrollCompact } from "@/shared/hooks/usePatientShellScrollCompact";

type Props = {
  children: ReactNode;
  /** При `false` полоска всегда видна (bottom-nav shell). */
  collapseOnScroll?: boolean;
};

/**
 * Полоска заголовка под primary nav: при `collapseOnScroll` схлопывается при прокрутке.
 */
export function PatientShellPageTitleStrip({ children, collapseOnScroll = true }: Props) {
  const compactScroll = usePatientShellScrollCompact();
  const show = collapseOnScroll ? !compactScroll : true;

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
            "border-b border-[var(--patient-border)] bg-white px-4 py-3",
            !show && "pointer-events-none",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
