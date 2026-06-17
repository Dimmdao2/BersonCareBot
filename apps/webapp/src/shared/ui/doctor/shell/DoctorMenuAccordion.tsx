"use client";

import Link from "next/link";
import { ArrowLeft, ChevronRight, LayoutDashboard, Users, Calendar, MessageCircle, BookOpen, FileText, BarChart3, Settings, Server, FolderOpen } from "lucide-react";
import type { ElementType } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { buttonVariants } from "@/shared/ui/doctor/primitives/button";
import { cn } from "@/lib/utils";
import { useDoctorRegistrationSystemFailureCount } from "@/modules/auth/hooks/useDoctorRegistrationSystemFailureCount";
import { useDoctorOnlineIntakeNewCount } from "@/modules/online-intake/hooks/useDoctorOnlineIntakeNewCount";
import { useDoctorPendingProgramTestsCount } from "@/modules/treatment-program/hooks/useDoctorPendingProgramTestsCount";
import { useDoctorProactiveInsightsCount } from "@/modules/doctor-proactive-insights/hooks/useDoctorProactiveInsightsCount";
import { useDoctorSupportUnreadCount } from "@/shared/hooks/useSupportUnreadPolling";
import {
  getDoctorMenuItems,
  isDoctorNavItemActive,
  type DoctorMenuAccess,
  type DoctorMenuBadgeKey,
  type DoctorMenuLinkItem,
} from "@/shared/ui/doctor/doctorNavLinks";
import { NAV_STRIP_ICON_STROKE } from "@/shared/ui/doctor/navChrome";

/** Отображаемый текст бейджа; `null` — не показывать. */
export function formatNavBadgeCount(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 100) return "99+";
  return String(Math.floor(n));
}

function badgeSpanAriaLabel(badgeKey: DoctorMenuBadgeKey, formatted: string): string {
  if (badgeKey === "onlineIntakeNew") return `Новых заявок: ${formatted}`;
  if (badgeKey === "registrationSystemFailures") return `Сбоев регистрации: ${formatted}`;
  if (badgeKey === "pendingProgramTests") return `К проверке: ${formatted}`;
  if (badgeKey === "todayAttention") return `Требует внимания: ${formatted}`;
  if (badgeKey === "communicationsTotal") return `Непрочитанных: ${formatted}`;
  return `Непрочитанных сообщений: ${formatted}`;
}

function linkAriaLabelWhenBadged(item: DoctorMenuLinkItem, formatted: string): string | undefined {
  if (!item.badgeKey || !formatted) return undefined;
  if (item.badgeKey === "onlineIntakeNew") return `${item.label}. Новых заявок: ${formatted}.`;
  if (item.badgeKey === "registrationSystemFailures") return `${item.label}. Сбоев регистрации: ${formatted}.`;
  if (item.badgeKey === "pendingProgramTests") return `${item.label}. К проверке: ${formatted}.`;
  if (item.badgeKey === "todayAttention") return `${item.label}. Требует внимания: ${formatted}.`;
  if (item.badgeKey === "communicationsTotal") return `${item.label}. Непрочитанных: ${formatted}.`;
  return `${item.label}. Непрочитанных сообщений: ${formatted}.`;
}

function navBadgeClassName(badgeKey: DoctorMenuBadgeKey): string {
  if (badgeKey === "registrationSystemFailures") {
    return "inline-flex min-h-[1.25rem] min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-medium tabular-nums leading-none text-destructive-foreground";
  }
  return "inline-flex min-h-[1.25rem] min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums leading-none text-muted-foreground";
}

function getIconForMenuId(id: string): ElementType | null {
  switch (id) {
    case "today": return LayoutDashboard;
    case "patients": return Users;
    case "clients": return Users;
    case "schedule": return Calendar;
    case "communications": return MessageCircle;
    case "library": return BookOpen;
    case "content": return FileText;
    case "files-and-media": return FolderOpen;
    case "analytics": return BarChart3;
    case "settings": return Settings;
    case "system": return Server;
    default: return null;
  }
}

const SIDEBAR_LINK_CLASS = cn(
  buttonVariants({ variant: "ghost" }),
  "h-auto w-full justify-start px-3 py-2 text-sm font-normal",
);

const SHEET_LINK_CLASS = cn(
  buttonVariants({ variant: "ghost" }),
  "h-auto w-full justify-start px-3 py-2 font-normal",
);

const FLYOUT_LINK_CLASS = cn(
  buttonVariants({ variant: "ghost" }),
  "h-auto w-full justify-start px-3 py-2 text-sm font-normal",
);

export type DoctorMenuAccordionProps = {
  variant: "sidebar" | "sheet";
  pathname: string;
  menuAccess: DoctorMenuAccess;
  /** Если `"клиент"`, пункт «Пациенты» отображается как «Клиенты». */
  patientLabel?: string;
  /** Вызывается после навигации по пункту меню (например закрытие Sheet на mobile). */
  onNavigate?: () => void;
};

/**
 * Sidebar: hover-flyout to the right.
 *
 * FIX for Q-C1 flicker: the previous implementation used @base-ui/react/popover which renders
 * into a portal (outside the trigger's DOM subtree). A 4px gap between trigger and portal content
 * caused onMouseLeave to fire on the trigger before onMouseEnter fired on the content, racing
 * against base-ui's own click-outside close logic. Even with a 120ms debounce the Popover's
 * internal state machine would fire synchronously and win the race.
 *
 * Solution: render the flyout panel as a CHILD of a wrapper div that spans both the trigger and
 * the panel. The wrapper is `position: relative; overflow: visible`. The panel is
 * `position: absolute; left: 100%`. Mouse movement from trigger→panel never fires a mouseleave
 * on the wrapper — it's all within the same DOM subtree. The wrapper's onMouseEnter/onMouseLeave
 * control open/close with a small delay to handle fast movements cleanly.
 */
function SidebarGroupFlyout({
  item,
  badgeCounts,
  pathname,
  onNavigate,
}: {
  item: DoctorMenuLinkItem;
  badgeCounts: Record<DoctorMenuBadgeKey, number>;
  pathname: string;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const Icon = getIconForMenuId(item.id);
  const iconSize = 16;

  const cancelTimers = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (openTimerRef.current !== null) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);

  const handleWrapperEnter = useCallback(() => {
    cancelTimers();
    // Small open delay (80ms) acts as hover-intent — prevents accidental open on fast cursor sweeps.
    openTimerRef.current = setTimeout(() => setOpen(true), 80);
  }, [cancelTimers]);

  const handleWrapperLeave = useCallback(() => {
    cancelTimers();
    // Close delay (150ms) gives the user time to correct their trajectory.
    closeTimerRef.current = setTimeout(() => setOpen(false), 150);
  }, [cancelTimers]);

  // Check if any sub-item is active (to highlight the group trigger)
  const anySubActive = useMemo(
    () => item.items?.some((sub) => sub.href && isDoctorNavItemActive(sub.href, pathname)) ?? false,
    [item.items, pathname],
  );

  return (
    // Wrapper spans both trigger and flyout panel.
    // overflow-visible is important so the absolutely-positioned panel is not clipped.
    // The negative right margin (-mr-2) compensates for the sidebar's pr-2 so the panel
    // appears flush to the sidebar's right edge.
    <div
      className="relative"
      onMouseEnter={handleWrapperEnter}
      onMouseLeave={handleWrapperLeave}
    >
      <button
        type="button"
        id={`doctor-sidebar-group-${item.id}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? `doctor-sidebar-flyout-${item.id}` : undefined}
        onFocus={() => {
          cancelTimers();
          setOpen(true);
        }}
        onBlur={(e) => {
          // Only close on blur if focus leaves the whole flyout tree
          if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node | null)) {
            closeTimerRef.current = setTimeout(() => setOpen(false), 150);
          }
        }}
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "flex h-auto w-full items-center justify-start gap-2 px-3 py-2 text-left text-sm font-normal",
          anySubActive && "bg-primary/15 font-medium text-primary hover:bg-primary/15 focus-visible:bg-primary/15",
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {Icon && (
            <Icon
              size={iconSize}
              strokeWidth={NAV_STRIP_ICON_STROKE}
              aria-hidden
              className="shrink-0"
            />
          )}
          <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
        </span>
        <ChevronRight
          className="size-3 shrink-0 text-muted-foreground"
          strokeWidth={NAV_STRIP_ICON_STROKE}
          aria-hidden
        />
      </button>

      {/* Flyout panel — absolutely positioned to the right of the trigger, same top.
          Rendered in-tree (no portal) so mouse movement between trigger and panel
          stays within the wrapper and never triggers a close. */}
      {open && (
        <div
          id={`doctor-sidebar-flyout-${item.id}`}
          role="menu"
          aria-label={item.label}
          className={cn(
            "absolute top-0 left-full z-50 ml-1",
            "min-w-[12rem] w-52 rounded-lg bg-popover p-1.5 text-sm text-popover-foreground",
            "shadow-md ring-1 ring-foreground/10",
            "flex flex-col gap-0.5",
          )}
        >
          {item.items?.map((sub) => {
            if (!sub.href) return null;
            const rawCount = sub.badgeKey ? badgeCounts[sub.badgeKey] : 0;
            const badgeText = sub.badgeKey ? formatNavBadgeCount(rawCount) : null;
            const aria = badgeText ? linkAriaLabelWhenBadged(sub, badgeText) : undefined;
            return (
              <Link
                key={sub.id}
                id={`doctor-sidebar-link-${sub.id}`}
                href={sub.href}
                prefetch={false}
                role="menuitem"
                onClick={onNavigate}
                aria-label={aria}
                className={cn(
                  FLYOUT_LINK_CLASS,
                  isDoctorNavItemActive(sub.href, pathname) &&
                    "bg-primary/15 font-medium text-primary hover:bg-primary/15 focus-visible:bg-primary/15",
                )}
              >
                <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate">{sub.label}</span>
                  {badgeText && sub.badgeKey ? (
                    <span
                      className={navBadgeClassName(sub.badgeKey)}
                      aria-label={badgeSpanAriaLabel(sub.badgeKey, badgeText)}
                    >
                      {badgeText}
                    </span>
                  ) : null}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Mobile sheet: two-level navigation.
 * Level 1 = top-level items; tapping a group pushes to Level 2.
 * Level 2 = sub-items with back button.
 */
function SheetTwoLevelMenu({
  items,
  badgeCounts,
  pathname,
  onNavigate,
}: {
  items: DoctorMenuLinkItem[];
  badgeCounts: Record<DoctorMenuBadgeKey, number>;
  pathname: string;
  onNavigate?: () => void;
}) {
  const [activeGroup, setActiveGroup] = useState<DoctorMenuLinkItem | null>(null);

  const renderLink = (item: DoctorMenuLinkItem, icon?: ElementType) => {
    if (!item.href) return null;
    const rawCount = item.badgeKey ? badgeCounts[item.badgeKey] : 0;
    const badgeText = item.badgeKey ? formatNavBadgeCount(rawCount) : null;
    const aria = badgeText ? linkAriaLabelWhenBadged(item, badgeText) : undefined;
    const Icon = icon ?? null;

    return (
      <Link
        key={item.id}
        id={`doctor-menu-link-${item.id}`}
        href={item.href}
        prefetch={false}
        onClick={onNavigate}
        aria-label={aria}
        className={cn(
          SHEET_LINK_CLASS,
          isDoctorNavItemActive(item.href, pathname) &&
            "bg-primary/15 font-medium text-primary hover:bg-primary/15 focus-visible:bg-primary/15",
        )}
      >
        <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
            {Icon && (
              <Icon
                size={18}
                strokeWidth={NAV_STRIP_ICON_STROKE}
                aria-hidden
                className="shrink-0"
              />
            )}
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
          </span>
          {badgeText && item.badgeKey ? (
            <span
              className={navBadgeClassName(item.badgeKey)}
              aria-label={badgeSpanAriaLabel(item.badgeKey, badgeText)}
            >
              {badgeText}
            </span>
          ) : null}
        </span>
      </Link>
    );
  };

  if (activeGroup) {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setActiveGroup(null)}
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "mb-1 h-auto w-full items-center justify-start gap-2 px-3 py-2 font-normal text-muted-foreground",
          )}
        >
          <ArrowLeft size={16} strokeWidth={NAV_STRIP_ICON_STROKE} aria-hidden className="shrink-0" />
          <span className="text-sm font-semibold text-foreground">{activeGroup.label}</span>
        </button>
        <div className="flex flex-col gap-0.5">
          {activeGroup.items?.map((sub) => renderLink(sub))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => {
        if (!item.items) {
          // Simple top-level link
          return renderLink(item, getIconForMenuId(item.id) ?? undefined);
        }

        // Group trigger — tap opens second level
        const Icon = getIconForMenuId(item.id);
        const anySubActive = item.items.some((sub) => sub.href && isDoctorNavItemActive(sub.href, pathname));

        return (
          <button
            key={item.id}
            type="button"
            id={`doctor-menu-group-${item.id}`}
            aria-haspopup="menu"
            onClick={() => setActiveGroup(item)}
            className={cn(
              buttonVariants({ variant: "ghost" }),
              "flex h-auto w-full items-center justify-start gap-2 px-3 py-2 text-left font-normal",
              anySubActive && "bg-primary/15 font-medium text-primary hover:bg-primary/15",
            )}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              {Icon && (
                <Icon
                  size={18}
                  strokeWidth={NAV_STRIP_ICON_STROKE}
                  aria-hidden
                  className="shrink-0"
                />
              )}
              <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
            </span>
            <ChevronRight
              className="size-3.5 shrink-0 text-muted-foreground"
              strokeWidth={NAV_STRIP_ICON_STROKE}
              aria-hidden
            />
          </button>
        );
      })}
    </div>
  );
}

export function DoctorMenuAccordion({ variant, pathname, menuAccess, patientLabel, onNavigate }: DoctorMenuAccordionProps) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const items = useMemo(() => getDoctorMenuItems(menuAccess, patientLabel), [menuAccess.role, menuAccess.adminMode, patientLabel]);

  const messagesUnread = useDoctorSupportUnreadCount();
  const onlineIntakeNew = useDoctorOnlineIntakeNewCount();
  const pendingProgramTests = useDoctorPendingProgramTestsCount();
  const proactiveInsights = useDoctorProactiveInsightsCount();
  const registrationSystemFailures = useDoctorRegistrationSystemFailureCount(menuAccess.role === "admin");

  const badgeCounts = useMemo(
    () =>
      ({
        onlineIntakeNew,
        messagesUnread,
        registrationSystemFailures,
        pendingProgramTests,
        todayAttention: pendingProgramTests + proactiveInsights,
        communicationsTotal: onlineIntakeNew + messagesUnread,
      }) satisfies Record<DoctorMenuBadgeKey, number>,
    [onlineIntakeNew, messagesUnread, registrationSystemFailures, pendingProgramTests, proactiveInsights],
  );

  if (variant === "sheet") {
    return (
      <SheetTwoLevelMenu
        items={items}
        badgeCounts={badgeCounts}
        pathname={pathname}
        onNavigate={onNavigate}
      />
    );
  }

  // Sidebar (desktop): flat top-level list; groups get hover flyout
  return (
    <div className="flex flex-col gap-0.5">
      {items.map((item) => {
        if (!item.items) {
          // Simple top-level link with icon
          if (!item.href) return null;
          const Icon = getIconForMenuId(item.id);
          const rawCount = item.badgeKey ? badgeCounts[item.badgeKey] : 0;
          const badgeText = item.badgeKey ? formatNavBadgeCount(rawCount) : null;
          const aria = badgeText ? linkAriaLabelWhenBadged(item, badgeText) : undefined;
          return (
            <Link
              key={item.id}
              id={`doctor-sidebar-link-${item.id}`}
              href={item.href}
              prefetch={false}
              onClick={onNavigate}
              aria-label={aria}
              className={cn(
                SIDEBAR_LINK_CLASS,
                isDoctorNavItemActive(item.href, pathname) &&
                  "bg-primary/15 font-medium text-primary hover:bg-primary/15 focus-visible:bg-primary/15",
              )}
            >
              <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  {Icon && (
                    <Icon
                      size={16}
                      strokeWidth={NAV_STRIP_ICON_STROKE}
                      aria-hidden
                      className="shrink-0"
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </span>
                {badgeText && item.badgeKey ? (
                  <span
                    className={navBadgeClassName(item.badgeKey)}
                    aria-label={badgeSpanAriaLabel(item.badgeKey, badgeText)}
                  >
                    {badgeText}
                  </span>
                ) : null}
              </span>
            </Link>
          );
        }

        // Group → flyout
        return (
          <SidebarGroupFlyout
            key={item.id}
            item={item}
            badgeCounts={badgeCounts}
            pathname={pathname}
            onNavigate={onNavigate}
          />
        );
      })}
    </div>
  );
}
