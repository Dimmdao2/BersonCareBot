/**
 * Patient app shell: top/bottom chrome and main content under `#app-shell-patient`.
 */

import type { CSSProperties, ReactNode } from "react";
import { PatientGatedHeader } from "@/shared/ui/patient/shell/PatientGatedHeader";
import { PatientTopNav } from "@/shared/ui/patient/shell/PatientTopNav";
import { PatientBottomShellFrame } from "@/shared/ui/patient/shell/PatientBottomShellFrame";
import { PatientShellPageTitleStrip } from "@/shared/ui/patient/shell/PatientShellPageTitleStrip";
import { PATIENT_SHELL_NAV_VARIANT } from "@/shared/ui/patient/patientShellNavVariant";
import { cn } from "@/lib/utils";
import { patientSectionTitleClass } from "@/shared/ui/patient/patientVisual";
import {
  PATIENT_SHELL_CONTAINER_CLASS,
  PATIENT_SHELL_CONTAINER_BOTTOM_NAV_CLASS,
  PATIENT_SHELL_DESKTOP_MAX_CLASS,
  PATIENT_SHELL_MOBILE_MAX_CLASS,
  patientShellMaxWidthDataAttribute,
} from "@/shared/ui/patient/pwaLayoutClasses";
import type { SessionUser } from "@/shared/types/session";

export type PatientAppShellProps = {
  title: string;
  user: SessionUser | null;
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
  titleSmall?: boolean;
  variant?: "patient" | "patient-wide";
  patientFloatingSlot?: ReactNode;
  patientEmbedMain?: boolean;
  patientHideHome?: boolean;
  patientHideRightIcons?: boolean;
  patientBrandTitleBar?: boolean;
  patientTitleBadge?: string;
  patientHideBottomNav?: boolean;
  patientSuppressShellTitle?: boolean;
  patientShellTitleSlot?: ReactNode;
  patientShellAboveTitleSlot?: ReactNode;
  patientMobileHeaderSlot?: ReactNode;
};

export function PatientAppShell({
  title,
  children,
  backHref,
  backLabel = "Назад",
  variant: _variant = "patient",
  patientFloatingSlot,
  patientEmbedMain = false,
  patientHideHome = false,
  patientHideRightIcons = false,
  patientBrandTitleBar = false,
  patientTitleBadge,
  patientHideBottomNav = false,
  patientSuppressShellTitle = false,
  patientShellTitleSlot,
  patientShellAboveTitleSlot,
  patientMobileHeaderSlot,
}: PatientAppShellProps) {
  const showPatientShellNav = !patientEmbedMain && !patientHideBottomNav && !patientBrandTitleBar;
  const useBottomNavShell = PATIENT_SHELL_NAV_VARIANT === "bottom";
  const hasPatientShellAboveTitleSlot = patientShellAboveTitleSlot != null;
  const shellTitleBadge = patientTitleBadge?.trim() ?? "";
  const shellTitle = title?.trim() ?? "";
  const showShellTitleStrip =
    showPatientShellNav &&
    !useBottomNavShell &&
    (patientShellTitleSlot != null ||
      (!patientSuppressShellTitle && (Boolean(shellTitleBadge) || Boolean(shellTitle))));

  return (
    <div
      id="app-shell-patient"
      {...patientShellMaxWidthDataAttribute()}
      className={cn(
        useBottomNavShell ? PATIENT_SHELL_CONTAINER_BOTTOM_NAV_CLASS : PATIENT_SHELL_CONTAINER_CLASS,
        patientEmbedMain
          ? "max-w-[480px] gap-0 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]"
          : cn(
              "gap-3",
              useBottomNavShell ? "safe-padding-patient-horiz" : "safe-padding-patient",
              PATIENT_SHELL_MOBILE_MAX_CLASS,
              PATIENT_SHELL_DESKTOP_MAX_CLASS,
            ),
      )}
    >
      {showPatientShellNav && useBottomNavShell ?
        null
      : showPatientShellNav ?
        <>
          <div className="z-50 shrink-0">
            <PatientTopNav backHref={backHref} backLabel={backLabel} />
          </div>
          {patientShellAboveTitleSlot ?
            <div className="w-full min-w-0 shrink-0">{patientShellAboveTitleSlot}</div>
          : null}
          {showShellTitleStrip ?
            <PatientShellPageTitleStrip>
              {patientShellTitleSlot ?
                patientShellTitleSlot
              : <>
                  {shellTitleBadge ?
                    <span
                      data-testid="patient-header-title-badge"
                      className="inline-block max-w-full truncate rounded-full border border-border bg-muted/70 px-2 py-0.5 text-[10px] font-medium text-foreground"
                      title={shellTitleBadge}
                    >
                      {shellTitleBadge}
                    </span>
                  : null}
                  {shellTitle ?
                    <h1
                      className={cn(
                        patientSectionTitleClass,
                        "min-w-0",
                        shellTitleBadge && "mt-2",
                      )}
                    >
                      {shellTitle}
                    </h1>
                  : null}
                </>
              }
            </PatientShellPageTitleStrip>
          : null}
        </>
      : null}
      {showPatientShellNav ?
        null
      : <div data-testid="patient-gated-header-wrap">
          <PatientGatedHeader
            pageTitle={title}
            showBack={!!backHref}
            backHref={backHref}
            backLabel={backLabel}
            hideHome={patientHideHome}
            hideRightIcons={patientHideRightIcons}
            brandTitleBar={patientBrandTitleBar}
            titleBadge={patientTitleBadge}
          />
        </div>}
      {showPatientShellNav && useBottomNavShell ?
        <PatientBottomShellFrame
          title={shellTitle}
          titleBadge={shellTitleBadge || undefined}
          backHref={backHref}
          backLabel={backLabel}
          suppressTitle={patientSuppressShellTitle}
          shellTitleSlot={patientShellTitleSlot}
          mobileHeaderCenter={patientMobileHeaderSlot}
          aboveTitleSlot={patientShellAboveTitleSlot}
        >
          <main
            id="app-shell-content"
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col",
              patientEmbedMain ?
                "gap-0 pt-0"
              : cn(
                  "gap-[var(--patient-gap)] patient-shell-content-pad",
                  hasPatientShellAboveTitleSlot && "patient-shell-content-pad--flush-top",
                ),
            )}
          >
            {children}
          </main>
        </PatientBottomShellFrame>
      : <main
          id="app-shell-content"
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col",
            patientEmbedMain ? "gap-0 pt-0" : "gap-[var(--patient-gap)] pt-1",
          )}
        >
          {children}
        </main>}
      {patientFloatingSlot}
    </div>
  );
}
