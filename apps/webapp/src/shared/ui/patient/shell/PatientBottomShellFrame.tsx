"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  isPatientHeaderProfileRoute,
  shouldShowPatientMobileHeaderBack,
} from "@/app-layer/routes/navigation";
import { cn } from "@/lib/utils";
import { patientSectionTitleClass } from "@/shared/ui/patient/patientVisual";
import { PatientBottomNav } from "@/shared/ui/patient/shell/PatientBottomNav";
import { PatientShellTopChrome } from "@/shared/ui/patient/shell/PatientShellTopChrome";
import { PatientShellPageTitleStrip } from "@/shared/ui/patient/shell/PatientShellPageTitleStrip";
import { PatientShellPageTitleWithHistoryBack } from "@/shared/ui/patient/PatientShellPageTitleWithHistoryBack";

export type PatientBottomShellFrameProps = {
  title: string;
  titleBadge?: string;
  backHref?: string;
  backLabel?: string;
  suppressTitle?: boolean;
  shellTitleSlot?: ReactNode;
  mobileHeaderCenter?: ReactNode;
  aboveTitleSlot?: ReactNode;
  children: ReactNode;
  bottomNav?: ReactNode;
};

/**
 * Оболочка bottom-nav patient shell: фиксированный top chrome, заголовок подстраниц в потоке контента.
 */
export function PatientBottomShellFrame({
  title,
  titleBadge,
  backHref,
  backLabel = "Назад",
  suppressTitle = false,
  shellTitleSlot,
  mobileHeaderCenter,
  aboveTitleSlot,
  children,
  bottomNav = <PatientBottomNav />,
}: PatientBottomShellFrameProps) {
  const pathname = usePathname() ?? "";
  const isPrimaryRoot = isPatientHeaderProfileRoute(pathname);
  const shellTitle = title.trim();
  const shellTitleBadge = titleBadge?.trim() ?? "";

  const hasShellTitleContent =
    shellTitleSlot != null || Boolean(shellTitleBadge) || Boolean(shellTitle) || Boolean(backHref);
  const showSubpageTitleStrip =
    !isPrimaryRoot &&
    !suppressTitle &&
    hasShellTitleContent &&
    (shellTitleSlot != null ||
      !backHref ||
      shouldShowPatientMobileHeaderBack(pathname, backHref));

  return (
    <>
      <PatientShellTopChrome
        title={shellTitle}
        titleBadge={shellTitleBadge || undefined}
        backHref={backHref}
        backLabel={backLabel}
        suppressTitle={suppressTitle}
        showBack={shouldShowPatientMobileHeaderBack(pathname, backHref)}
        mobileHeaderCenter={mobileHeaderCenter}
      />
      <div
        className={cn(
          "shrink-0 patient-mobile:pt-[calc(var(--patient-header-bar-height,var(--patient-header-bar-chrome-fallback))_+_var(--patient-header-fade-height,0.5rem))]",
          "patient-desktop:pt-0",
        )}
        aria-hidden
      />
      {aboveTitleSlot ?
        <div className="w-full min-w-0 shrink-0">{aboveTitleSlot}</div>
      : null}
      {showSubpageTitleStrip ?
        <div className="hidden min-w-0 shrink-0 patient-desktop:block">
          <PatientShellPageTitleStrip collapseOnScroll={false}>
          {shellTitleSlot ?
            shellTitleSlot
          : backHref || shellTitle ?
            <>
              {shellTitleBadge ?
                <span
                  data-testid="patient-header-title-badge"
                  className="mb-2 inline-block max-w-full truncate rounded-full border border-border bg-muted/70 px-2 py-0.5 text-[10px] font-medium text-foreground"
                  title={shellTitleBadge}
                >
                  {shellTitleBadge}
                </span>
              : null}
              <PatientShellPageTitleWithHistoryBack
                title={shellTitle || " "}
                backLabel={backLabel}
                fallbackHref={backHref}
              />
            </>
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
                <h1 className={cn(patientSectionTitleClass, "min-w-0", shellTitleBadge && "mt-2")}>
                  {shellTitle}
                </h1>
              : null}
            </>
          }
          </PatientShellPageTitleStrip>
        </div>
      : null}
      {children}
      {bottomNav}
    </>
  );
}
