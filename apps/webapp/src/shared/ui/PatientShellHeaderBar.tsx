"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { ChevronLeft, UserCircle } from "lucide-react";
import { routePaths } from "@/app-layer/routes/paths";
import { isPatientHeaderProfileRoute } from "@/app-layer/routes/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePatientShellGoBack } from "@/shared/hooks/usePatientShellGoBack";
import { useReportShellChromeHeight } from "@/shared/hooks/useReportShellChromeHeight";
import { patientSectionTitleClass } from "@/shared/ui/patientVisual";
import { PatientPrimaryNavStrip } from "@/shared/ui/patient/PatientPrimaryNavStrip";
import { NAV_STRIP_ICON_STROKE } from "@/shared/ui/navChrome";

export const PATIENT_HEADER_BAR_HEIGHT_VAR = "--patient-header-bar-height";

const HEADER_ICON_BTN =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-md text-[var(--patient-text-primary)] hover:bg-[var(--patient-color-primary-soft)]/50";

type PatientShellHeaderBarLeftProps = {
  backHref?: string;
  backLabel?: string;
};

function PatientShellHeaderBarLeft({ backHref, backLabel = "Назад" }: PatientShellHeaderBarLeftProps) {
  const pathname = usePathname() ?? "";
  const goBack = usePatientShellGoBack(backHref);

  if (isPatientHeaderProfileRoute(pathname)) {
    return (
      <Link
        href={routePaths.profile}
        prefetch={false}
        aria-label="Профиль"
        className={HEADER_ICON_BTN}
      >
        <UserCircle className="size-5" strokeWidth={NAV_STRIP_ICON_STROKE} aria-hidden />
      </Link>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-10 shrink-0 text-[var(--patient-text-primary)]"
      onClick={goBack}
      aria-label={backLabel}
    >
      <ChevronLeft className="size-5" strokeWidth={NAV_STRIP_ICON_STROKE} aria-hidden />
    </Button>
  );
}

export type PatientShellHeaderBarProps = {
  title: string;
  titleBadge?: string;
  backHref?: string;
  backLabel?: string;
};

/**
 * Верхняя полоска patient shell: профиль/назад + заголовок; на desktop — primary nav в той же колонке.
 * На всю ширину колонки shell (`safe-bleed-x`), без fixed centering по viewport.
 */
export function PatientShellHeaderBar({ title, titleBadge, backHref, backLabel }: PatientShellHeaderBarProps) {
  const headerRef = useRef<HTMLDivElement>(null);
  useReportShellChromeHeight(headerRef, PATIENT_HEADER_BAR_HEIGHT_VAR);
  const shellTitle = title.trim();
  const shellTitleBadge = titleBadge?.trim() ?? "";

  return (
    <div
      ref={headerRef}
      data-testid="patient-shell-header-bar"
      className={cn(
        "safe-bleed-x z-50 w-full min-w-0 max-w-full shrink-0",
        "sticky top-0 border-b border-[var(--patient-border)] bg-[rgba(255,255,255,0.96)] backdrop-blur-md patient-desktop:bg-white",
        "pt-[max(0px,env(safe-area-inset-top,0px))]",
        "shadow-[var(--patient-shadow-nav)] patient-desktop:shadow-sm",
      )}
    >
      <div className="safe-padding-patient-horiz w-full min-w-0">
        <div className="grid min-h-12 grid-cols-[2.5rem_1fr_2.5rem] items-center gap-2 py-2">
          <div className="flex justify-start">
            <PatientShellHeaderBarLeft backHref={backHref} backLabel={backLabel} />
          </div>
          <div className="min-w-0 text-center">
            {shellTitleBadge ?
              <span
                data-testid="patient-header-title-badge"
                className="mb-1 inline-block max-w-full truncate rounded-full border border-border bg-muted/70 px-2 py-0.5 text-[10px] font-medium text-foreground"
                title={shellTitleBadge}
              >
                {shellTitleBadge}
              </span>
            : null}
            {shellTitle ?
              <h1
                className={cn(
                  patientSectionTitleClass,
                  "m-0 min-w-0 truncate text-base leading-tight",
                  shellTitleBadge && "mt-1",
                )}
              >
                {shellTitle}
              </h1>
            : null}
          </div>
          <div aria-hidden className="w-10" />
        </div>
        <div className="hidden border-t border-[var(--patient-border)]/80 py-1.5 patient-desktop:block">
          <PatientPrimaryNavStrip variant="inline" />
        </div>
      </div>
    </div>
  );
}
