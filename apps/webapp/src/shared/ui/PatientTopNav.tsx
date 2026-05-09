"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, type RefObject } from "react";
import {
  Bell,
  BookOpen,
  CalendarCheck,
  CalendarPlus,
  ClipboardList,
  Home,
  LayoutGrid,
  MessageCircle,
  Stethoscope,
  UserCircle,
} from "lucide-react";
import { routePaths } from "@/app-layer/routes/paths";
import {
  getPatientPrimaryNavActiveId,
  PATIENT_PRIMARY_NAV_ITEMS,
  type PatientPrimaryNavItem,
  type PatientPrimaryNavItemId,
} from "@/app-layer/routes/navigation";
import { cn } from "@/lib/utils";
import { useReminderUnreadCount } from "@/shared/hooks/useReminderUnread";
import { NAV_STRIP_ICON_STROKE } from "@/shared/ui/navChrome";
import { usePatientShellScrollCompact } from "@/shared/hooks/usePatientShellScrollCompact";

const NAV_ICONS: Record<PatientPrimaryNavItemId, typeof LayoutGrid> = {
  today: Home,
  booking: CalendarPlus,
  diary: BookOpen,
  plan: ClipboardList,
  profile: UserCircle,
};

const DESKTOP_NAV_ICONS: Record<PatientPrimaryNavItemId, typeof LayoutGrid> = {
  today: LayoutGrid,
  booking: CalendarCheck,
  diary: BookOpen,
  plan: ClipboardList,
  profile: UserCircle,
};

const TOP_ICON_BTN =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-md text-[var(--patient-text-primary)] hover:bg-[var(--patient-color-primary-soft)]/50";

const PATIENT_TOP_NAV_HEIGHT_VAR = "--patient-top-nav-height";

/** Плавное переключение размеров при скролле (общий с подложкой под fixed-меню). */
const NAV_COMPACT_EASE = "duration-300 ease-in-out";

function useReportPatientTopNavHeight(ref: RefObject<HTMLDivElement | null>): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const setVar = () => {
      document.documentElement.style.setProperty(PATIENT_TOP_NAV_HEIGHT_VAR, `${el.offsetHeight}px`);
    };
    setVar();
    if (typeof ResizeObserver === "undefined") {
      return () => {
        document.documentElement.style.removeProperty(PATIENT_TOP_NAV_HEIGHT_VAR);
      };
    }
    const ro = new ResizeObserver(setVar);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty(PATIENT_TOP_NAV_HEIGHT_VAR);
    };
  }, [ref]);
}

export type PatientTopNavProps = {
  backHref?: string;
  backLabel?: string;
};

/** Верхняя primary-навигация пациента: при скролле подписи скрываются, высота строки плавно уменьшается вместе с текстом; размеры иконок не меняются. */
export function PatientTopNav(_props: PatientTopNavProps) {
  const pathname = usePathname() ?? "";
  const activeId = getPatientPrimaryNavActiveId(pathname);
  const reminderUnread = useReminderUnreadCount(true);
  const compact = usePatientShellScrollCompact();
  const navRootRef = useRef<HTMLDivElement>(null);
  useReportPatientTopNavHeight(navRootRef);

  const renderMobileNavLink = (item: PatientPrimaryNavItem) => {
    const Icon = NAV_ICONS[item.id];
    const isActive = activeId === item.id;
    return (
      <Link
        key={item.id}
        href={item.href}
        prefetch={false}
        aria-label={item.label}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "group flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center px-0.5",
          "transition-[gap,padding-block] [transition-property:gap,padding-block]",
          NAV_COMPACT_EASE,
          compact ? "gap-0 py-2.5" : "gap-1 py-1.5",
          isActive ?
            "font-medium text-[var(--patient-color-primary)]"
          : "font-normal text-[var(--patient-text-secondary)] hover:font-normal hover:text-[var(--patient-color-primary)]",
        )}
      >
        <Icon
          className={cn(
            "size-5 shrink-0 transition-colors duration-200 ease-out",
            isActive ?
              "size-[22px] text-[var(--patient-color-primary)]"
            : "text-[var(--patient-text-secondary)] group-hover:text-[var(--patient-color-primary)]",
          )}
          strokeWidth={NAV_STRIP_ICON_STROKE}
          aria-hidden
        />
        <span
          className={cn(
            "w-full truncate text-center text-[10px] leading-3 transition-[opacity,max-height] [transition-property:opacity,max-height]",
            NAV_COMPACT_EASE,
            compact ?
              "pointer-events-none max-h-0 overflow-hidden opacity-0"
            : "max-h-8 opacity-100",
          )}
        >
          {item.label}
        </span>
      </Link>
    );
  };

  const renderDesktopNavLink = (item: PatientPrimaryNavItem) => {
    const Icon = DESKTOP_NAV_ICONS[item.id];
    const isActive = activeId === item.id;
    return (
      <Link
        key={item.id}
        href={item.href}
        prefetch={false}
        aria-label={item.label}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "inline-flex min-h-0 items-center gap-1.5 rounded-lg px-2.5 font-normal text-sm",
          "transition-[gap,padding-block] [transition-property:gap,padding-block]",
          NAV_COMPACT_EASE,
          compact ? "gap-0 py-2" : "gap-1.5 py-2",
          "text-[var(--patient-text-muted)] transition-colors",
          isActive && "bg-[var(--patient-color-primary-soft)]/50 text-[var(--patient-color-primary)]",
          !isActive && "hover:bg-muted/60",
        )}
      >
        <Icon className="size-[18px] shrink-0" strokeWidth={NAV_STRIP_ICON_STROKE} aria-hidden />
        <span
          className={cn(
            "whitespace-nowrap transition-[opacity,max-height] [transition-property:opacity,max-height]",
            NAV_COMPACT_EASE,
            compact ? "pointer-events-none inline-block max-h-0 overflow-hidden opacity-0" : "max-h-10 opacity-100",
          )}
        >
          {item.label}
        </span>
      </Link>
    );
  };

  return (
    <>
      {/*
        На узкой ширине шапка position:fixed к верху окна — sticky здесь часто ломается (предки,
        breakout margin). Резерв высоты только mobile: desktop остаётся в потоке (`lg:sticky`).
      */}
      <div
        aria-hidden
        className="shrink-0 lg:hidden"
        style={{ height: `var(${PATIENT_TOP_NAV_HEIGHT_VAR}, 3.5rem)` }}
      />
      <div
        ref={navRootRef}
        id="patient-top-nav"
        className={cn(
          "z-50 w-full transition-shadow",
          NAV_COMPACT_EASE,
          /* mobile: к краю окна */
          "max-lg:fixed max-lg:left-0 max-lg:right-0 max-lg:top-[env(safe-area-inset-top,0px)]",
          /* desktop: липкая полоска в колонке shell */
          "lg:sticky lg:top-[env(safe-area-inset-top,0px)]",
          "border-b border-[var(--patient-border)] bg-[rgba(255,255,255,0.96)] backdrop-blur-md lg:bg-[var(--patient-surface)]",
          compact ? "shadow-md lg:shadow-sm" : "shadow-[var(--patient-shadow-nav)] lg:shadow-sm",
        )}
      >
        <nav
          aria-label="Основная навигация пациента"
          data-testid="patient-mobile-top-nav"
          className="mx-auto flex max-w-[430px] items-stretch justify-around px-1 py-1 lg:hidden"
        >
          {PATIENT_PRIMARY_NAV_ITEMS.map(renderMobileNavLink)}
        </nav>

        <div
          data-testid="patient-desktop-top-nav"
          className={cn(
            "mx-auto hidden w-full max-w-[min(1180px,calc(100vw-2rem))] items-center gap-4 px-4 lg:flex",
            "transition-[padding-block] [transition-property:padding-block]",
            NAV_COMPACT_EASE,
            compact ? "py-3" : "py-2.5",
          )}
        >
        <div className="flex min-w-0 shrink-0 items-center gap-1">
          <Link
            href={routePaths.patient}
            prefetch={false}
            className={cn(
              "flex shrink-0 items-center text-[var(--patient-text-primary)] transition-[gap] [transition-property:gap]",
              NAV_COMPACT_EASE,
              compact ? "gap-0" : "gap-2",
            )}
          >
            <Stethoscope
              className="size-6 shrink-0 text-[var(--patient-color-primary)]"
              strokeWidth={NAV_STRIP_ICON_STROKE}
              aria-hidden
            />
            <span
              className={cn(
                "font-semibold tracking-tight text-lg transition-[opacity,max-height] [transition-property:opacity,max-height]",
                NAV_COMPACT_EASE,
                compact ? "inline-block max-h-0 overflow-hidden opacity-0" : "max-h-8 opacity-100",
              )}
            >
              BersonCare
            </span>
          </Link>
        </div>
        <nav
          aria-label="Основная навигация"
          className="flex min-w-0 flex-1 justify-center gap-1"
        >
          {PATIENT_PRIMARY_NAV_ITEMS.map(renderDesktopNavLink)}
        </nav>
        <div className="flex shrink-0 items-center gap-1">
          <Link
            href={routePaths.patientReminders}
            prefetch={false}
            aria-label="Напоминания"
            className={cn(TOP_ICON_BTN, "relative")}
          >
            <Bell className="size-[22px]" strokeWidth={NAV_STRIP_ICON_STROKE} aria-hidden />
            {reminderUnread > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
                {reminderUnread > 99 ? "99+" : reminderUnread}
              </span>
            ) : null}
          </Link>
          <Link
            href={routePaths.patientMessages}
            prefetch={false}
            aria-label="Сообщения"
            className={cn(TOP_ICON_BTN, "relative")}
          >
            <MessageCircle className="size-[22px]" strokeWidth={NAV_STRIP_ICON_STROKE} aria-hidden />
          </Link>
        </div>
        </div>
      </div>
    </>
  );
}
