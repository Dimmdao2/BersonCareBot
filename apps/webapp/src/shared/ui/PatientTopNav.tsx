"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

export type PatientTopNavProps = {
  backHref?: string;
  backLabel?: string;
};

/** Верхняя primary-навигация пациента: mobile — бывший bottom nav, desktop — широкая шапка. */
export function PatientTopNav(_props: PatientTopNavProps) {
  const pathname = usePathname() ?? "";
  const activeId = getPatientPrimaryNavActiveId(pathname);
  const reminderUnread = useReminderUnreadCount(true);

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
          "flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-1 text-[11px] leading-4 transition-colors",
          isActive ?
            "font-semibold text-[var(--patient-color-primary)]"
          : "font-normal text-[var(--patient-text-secondary)] hover:text-[var(--patient-text-primary)]",
        )}
      >
        <Icon
          className={cn("size-6 shrink-0", isActive && "size-[26px]")}
          strokeWidth={NAV_STRIP_ICON_STROKE}
          aria-hidden
        />
        <span className="truncate">{item.label}</span>
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
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "inline-flex min-h-10 min-w-10 items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-normal",
          "text-[var(--patient-text-muted)] transition-colors",
          isActive && "bg-[var(--patient-color-primary-soft)]/50 text-[var(--patient-color-primary)]",
          !isActive && "hover:bg-muted/60",
        )}
      >
        <Icon className="size-[18px] shrink-0" strokeWidth={NAV_STRIP_ICON_STROKE} aria-hidden />
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <div
      id="patient-top-nav"
      className="relative left-1/2 w-screen -translate-x-1/2 border-b border-[var(--patient-border)] bg-[rgba(255,255,255,0.96)] shadow-[var(--patient-shadow-nav)] backdrop-blur-md lg:bg-[var(--patient-surface)] lg:shadow-sm"
    >
      <nav
        aria-label="Основная навигация пациента"
        data-testid="patient-mobile-top-nav"
        className="mx-auto flex max-w-[430px] items-stretch justify-around px-1 lg:hidden"
      >
        {PATIENT_PRIMARY_NAV_ITEMS.map(renderMobileNavLink)}
      </nav>

      <div
        data-testid="patient-desktop-top-nav"
        className="mx-auto hidden h-16 w-full max-w-[min(1180px,calc(100vw-2rem))] items-center gap-4 px-4 lg:flex"
      >
        <div className="flex min-w-0 shrink-0 items-center gap-1">
          <Link
            href={routePaths.patient}
            prefetch={false}
            className="flex shrink-0 items-center gap-2 text-[var(--patient-text-primary)]"
          >
            <Stethoscope
              className="size-6 shrink-0 text-[var(--patient-color-primary)]"
              strokeWidth={NAV_STRIP_ICON_STROKE}
              aria-hidden
            />
            <span className="text-lg font-semibold tracking-tight">BersonCare</span>
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
          <Link href={routePaths.patientMessages} prefetch={false} aria-label="Сообщения" className={TOP_ICON_BTN}>
            <MessageCircle className="size-[22px]" strokeWidth={NAV_STRIP_ICON_STROKE} aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}
