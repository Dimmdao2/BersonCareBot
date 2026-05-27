"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import { useReportShellChromeHeight } from "@/shared/hooks/useReportShellChromeHeight";
import {
  PATIENT_BOTTOM_NAV_FIXED_MOBILE_CLASS,
  PATIENT_SHELL_DESKTOP_MAX_CLASS,
  PATIENT_SHELL_MOBILE_MAX_CLASS,
} from "@/shared/lib/pwaLayoutClasses";
import { PatientPrimaryNavStrip } from "@/shared/ui/patient/PatientPrimaryNavStrip";

export const PATIENT_BOTTOM_NAV_HEIGHT_VAR = "--patient-bottom-nav-height";

/**
 * Нижняя primary-навигация (только mobile / узкий viewport).
 * На desktop вкладки в {@link PatientShellTopChrome}.
 *
 * `pb` = `--patient-bottom-nav-safe-bottom` (safe-area + небольшой зазор). Высота в
 * `--patient-bottom-nav-height`. Нужен `viewportFit: cover` в layout.
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
        PATIENT_BOTTOM_NAV_FIXED_MOBILE_CLASS,
        "patient-desktop:hidden",
        "mt-auto w-full shrink-0 border-t border-[var(--patient-border)] bg-[rgba(255,255,255,0.96)] backdrop-blur-md",
        "pb-[var(--patient-bottom-nav-safe-bottom)]",
        "shadow-[var(--patient-shadow-nav)]",
      )}
    >
      <div
        className={cn(
          "mx-auto min-h-14 w-full min-w-0 safe-padding-patient-horiz pt-2 pb-0",
          PATIENT_SHELL_MOBILE_MAX_CLASS,
          PATIENT_SHELL_DESKTOP_MAX_CLASS,
        )}
      >
        <PatientPrimaryNavStrip variant="bottom" />
      </div>
    </div>
  );
}
