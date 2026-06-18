"use client";

import Link from "next/link";
import { ArrowLeft, ChevronRight, LayoutDashboard, Users, Calendar, MessageCircle, BookOpen, FileText, BarChart3, Settings, Server, FolderOpen } from "lucide-react";
import type { ElementType } from "react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
 * into a portal (outside the trigger's DOM subtree). A 4px gap between trigger and portal
 * content caused onMouseLeave to fire on the trigger before onMouseEnter fired on the content,
 * racing against base-ui's own click-outside close logic.
 *
 * Root cause of the approach that used absolute positioning: the sidebar nav has `overflow-y: auto`,
 * which causes browsers to implicitly set `overflow-x: auto` too, clipping the absolutely-positioned
 * flyout. Moving to `position: fixed` with viewport-relative coordinates computed via
 * getBoundingClientRect() bypasses ALL overflow clipping.
 *
 * Solution: `position: fixed` flyout panel. Coordinates are computed synchronously via
 * useLayoutEffect when the panel opens. Mouse events on both trigger and panel share a close-
 * timer ref. Zero gap ensures cursor always reaches the panel before the timer fires.
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
  const [flyoutPos, setFlyoutPos] = useState<{ top: number; left: number } | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const Icon = getIconForMenuId(item.id);
  const iconSize = 16;

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setOpen(false), 150);
  }, [cancelClose]);

  // Compute fixed position synchronously before paint so there's no layout flash.
  useLayoutEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setFlyoutPos({ top: rect.top, left: rect.right });
    } else if (!open) {
      setFlyoutPos(null);
    }
  }, [open]);

  // Check if any sub-item is active (to highlight the group trigger)
  const anySubActive = useMemo(
    () => item.items?.some((sub) => sub.href && isDoctorNavItemActive(sub.href, pathname)) ?? false,
    [item.items, pathname],
  );

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        id={`doctor-sidebar-group-${item.id}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? `doctor-sidebar-flyout-${item.id}` : undefined}
        onMouseEnter={() => {
          cancelClose();
          setOpen(true);
        }}
        onMouseLeave={scheduleClose}
        onFocus={() => {
          cancelClose();
          setOpen(true);
        }}
        onBlur={(e) => {
          const wrapper = e.currentTarget.parentElement;
          if (!wrapper?.contains(e.relatedTarget as Node | null)) {
            scheduleClose();
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

      {/* Flyout panel: rendered via React portal into document.body to escape the sidebar's
          stacking context. Without a portal the sidebar stacking context sits below the
          FullCalendar context, so z-index:10000 loses cross-context hit-testing even though
          the element visually overlaps. Mounting into document.body (root stacking context)
          guarantees pointer-events reach the flyout. `position: fixed` coordinates are
          viewport-relative from getBoundingClientRect(), so they are unaffected by the portal. */}
      {open && flyoutPos && typeof document !== "undefined" &&
        createPortal(
          <div
            id={`doctor-sidebar-flyout-${item.id}`}
            role="menu"
            aria-label={item.label}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            style={{ top: flyoutPos.top, left: flyoutPos.left }}
            className={cn(
              "fixed z-[10000] pointer-events-auto",
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
          </div>,
          document.body,
        )
      }
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
