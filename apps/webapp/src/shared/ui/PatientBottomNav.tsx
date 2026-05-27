"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import { useReportShellChromeHeight } from "@/shared/hooks/useReportShellChromeHeight";
import { PatientPrimaryNavStrip } from "@/shared/ui/patient/PatientPrimaryNavStrip";

export const PATIENT_BOTTOM_NAV_HEIGHT_VAR = "--patient-bottom-nav-height";

/**
 * Нижняя primary-навигация (только mobile / узкий viewport).
 * На desktop вкладки в {@link PatientShellHeaderBar}.
 */
export function PatientBottomNav() {
  const navRootRef = useRef<HTMLDivElement>(null);
  useReportShellChromeHeight(navRootRef, PATIENT_BOTTOM_NAV_HEIGHT_VAR);

  return (
    <div
      ref={navRootRef}
      id="patient-bottom-nav"
      data-testid="patient-bottom-nav"
      className={cn(
        "safe-bleed-x patient-desktop:hidden",
        "z-50 mt-auto w-full min-w-0 max-w-full shrink-0",
        "sticky bottom-0 border-t border-[var(--patient-border)] bg-[rgba(255,255,255,0.96)] backdrop-blur-md",
        "pb-[max(0px,env(safe-area-inset-bottom,0px))]",
        "shadow-[var(--patient-shadow-nav)]",
      )}
    >
      <div className="safe-padding-patient-horiz py-1">
        <PatientPrimaryNavStrip variant="bottom" />
      </div>
    </div>
  );
}
