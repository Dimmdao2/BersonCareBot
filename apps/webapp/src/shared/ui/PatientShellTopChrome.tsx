"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, type ReactNode } from "react";
import { ChevronLeft, User } from "lucide-react";
import { routePaths } from "@/app-layer/routes/paths";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePatientShellGoBack } from "@/shared/hooks/usePatientShellGoBack";
import { useReportShellChromeHeight } from "@/shared/hooks/useReportShellChromeHeight";
import {
  PATIENT_HEADER_BAR_FIXED_MOBILE_CLASS,
  PATIENT_SHELL_DESKTOP_MAX_CLASS,
  PATIENT_SHELL_MOBILE_MAX_CLASS,
} from "@/shared/lib/pwaLayoutClasses";
import { PatientPrimaryNavStrip } from "@/shared/ui/patient/PatientPrimaryNavStrip";
import { NAV_STRIP_ICON_STROKE } from "@/shared/ui/navChrome";

export const PATIENT_HEADER_BAR_HEIGHT_VAR = "--patient-header-bar-height";

const MOBILE_TOOLBAR_ROW_BASE =
  "patient-shell-mobile-toolbar h-[var(--patient-header-bar-row-height,3rem)] overflow-hidden patient-desktop:hidden";

const CHROME_ICON_BTN_BASE =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-md transition-colors duration-200 ease-out hover:bg-[var(--patient-color-primary-soft)]/50";

const MOBILE_HEADER_TITLE_CLASS =
  "m-0 min-w-0 truncate text-left text-[15px] font-normal leading-5 text-[var(--patient-block-heading)]";

const MOBILE_HEADER_TITLE_ROW_CLASS =
  "flex min-w-0 flex-1 items-center justify-start gap-1.5";

function profileIconBtnClass(isActive: boolean): string {
  return cn(
    CHROME_ICON_BTN_BASE,
    isActive ?
      "text-[var(--patient-color-primary)]"
    : "text-[var(--patient-text-secondary)] hover:text-[var(--patient-color-primary)]",
  );
}

export type PatientShellTopChromeProps = {
  title?: string;
  titleBadge?: string;
  backHref?: string;
  backLabel?: string;
  /** Скрыть заголовок в mobile-шапке (главная «Сегодня» и т.п.). */
  suppressTitle?: boolean;
  /** Показать «назад» слева (подстраницы). */
  showBack?: boolean;
  /** Кастомный центр mobile-шапки (напр. приветствие на «Сегодня»). */
  mobileHeaderCenter?: ReactNode;
};

/**
 * Верхний chrome patient shell (bottom-nav вариант).
 * Mobile: назад (подстраницы) + заголовок + профиль; desktop: вкладки + профиль.
 */
export function PatientShellTopChrome({
  title = "",
  titleBadge,
  backHref,
  backLabel = "Назад",
  suppressTitle = false,
  showBack = false,
  mobileHeaderCenter,
}: PatientShellTopChromeProps) {
  const pathname = usePathname() ?? "";
  const headerRef = useRef<HTMLDivElement>(null);
  useReportShellChromeHeight(headerRef, PATIENT_HEADER_BAR_HEIGHT_VAR);
  const goBack = usePatientShellGoBack(backHref);
  const isProfileActive =
    pathname === routePaths.profile || pathname.startsWith(`${routePaths.profile}/`);
  const shellTitle = title.trim();
  const shellTitleBadge = titleBadge?.trim() ?? "";
  const showMobileTitle =
    Boolean(mobileHeaderCenter) ||
    (!suppressTitle && (Boolean(shellTitle) || Boolean(shellTitleBadge)));

  return (
    <div
      ref={headerRef}
      data-testid="patient-shell-top-chrome"
      className={cn(
        PATIENT_HEADER_BAR_FIXED_MOBILE_CLASS,
        "relative isolate z-50 w-full shrink-0",
        "patient-desktop:sticky patient-desktop:top-0",
        "pt-[max(0px,env(safe-area-inset-top,0px))]",
      )}
    >
      <div className="patient-shell-top-chrome-surface">
        <div
          className={cn(
            "mx-auto w-full min-w-0 safe-padding-patient-horiz",
            PATIENT_SHELL_MOBILE_MAX_CLASS,
            PATIENT_SHELL_DESKTOP_MAX_CLASS,
          )}
        >
        <div className={MOBILE_TOOLBAR_ROW_BASE}>
          <div className="patient-shell-chrome-action-slot">
            {showBack ?
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 shrink-0 text-[var(--patient-text-secondary)] hover:text-[var(--patient-color-primary)]"
                onClick={goBack}
                aria-label={backLabel}
              >
                <ChevronLeft className="size-5" strokeWidth={NAV_STRIP_ICON_STROKE} aria-hidden />
              </Button>
            : null}
          </div>
          {showMobileTitle ?
            <div className={MOBILE_HEADER_TITLE_ROW_CLASS}>
              {shellTitleBadge ?
                <span
                  data-testid="patient-header-title-badge"
                  className="max-w-[38%] shrink-0 truncate rounded-full border border-border bg-muted/70 px-1.5 py-px text-[10px] font-medium leading-4 text-foreground"
                  title={shellTitleBadge}
                >
                  {shellTitleBadge}
                </span>
              : null}
              {mobileHeaderCenter ?
                <div className="min-w-0 flex-1 text-left">{mobileHeaderCenter}</div>
              : shellTitle ?
                <h1 className={cn(MOBILE_HEADER_TITLE_CLASS, "flex-1")}>{shellTitle}</h1>
              : null}
            </div>
          : <div aria-hidden />}
          <div className="patient-shell-chrome-action-slot">
            <Link
              href={routePaths.profile}
              prefetch={false}
              aria-label="Профиль"
              className={profileIconBtnClass(isProfileActive)}
            >
              <User className="size-5" strokeWidth={NAV_STRIP_ICON_STROKE} aria-hidden />
            </Link>
          </div>
        </div>

        <div className="hidden h-11 items-center gap-2 patient-desktop:flex">
          <div className="min-w-0 flex-1">
            <PatientPrimaryNavStrip variant="inline" />
          </div>
          <Link
            href={routePaths.profile}
            prefetch={false}
            aria-label="Профиль"
            className={profileIconBtnClass(isProfileActive)}
          >
            <User className="size-5" strokeWidth={NAV_STRIP_ICON_STROKE} aria-hidden />
          </Link>
        </div>
        </div>
      </div>
      <div aria-hidden className="patient-shell-top-chrome-fade" />
    </div>
  );
}
