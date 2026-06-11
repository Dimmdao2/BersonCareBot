"use client";

import Link from "next/link";
import { ChevronRight, LayoutDashboard, Users, Calendar, MessageCircle, BookOpen, FileText, BarChart3, Settings, Server } from "lucide-react";
import type { ElementType } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { buttonVariants } from "@/shared/ui/doctor/primitives/button";
import { cn } from "@/lib/utils";
import { useDoctorRegistrationSystemFailureCount } from "@/modules/auth/hooks/useDoctorRegistrationSystemFailureCount";
import { useDoctorOnlineIntakeNewCount } from "@/modules/online-intake/hooks/useDoctorOnlineIntakeNewCount";
import { useDoctorPendingProgramTestsCount } from "@/modules/treatment-program/hooks/useDoctorPendingProgramTestsCount";
import { useDoctorProactiveInsightsCount } from "@/modules/doctor-proactive-insights/hooks/useDoctorProactiveInsightsCount";
import { useDoctorSupportUnreadCount } from "@/shared/hooks/useSupportUnreadPolling";
import {
  DOCTOR_MENU_DEFAULT_CLUSTER_ID,
  DOCTOR_MENU_OPEN_CLUSTER_STORAGE_KEY,
  DOCTOR_MENU_OPEN_CLUSTERS_STORAGE_KEY,
  getDoctorMenuItems,
  isDoctorMenuClusterId,
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
    case "clients": return Users;
    case "schedule": return Calendar;
    case "communications": return MessageCircle;
    case "library": return BookOpen;
    case "content": return FileText;
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

const CLUSTER_TRIGGER_CLASS = cn(
  buttonVariants({ variant: "ghost" }),
  "flex h-auto w-full items-center justify-start gap-2 px-3 py-2 text-left text-sm font-semibold text-foreground",
);

/** Читает открытый кластер: JSON-массив (берётся последний валидный id), иначе миграция v1. `null` — оставить начальный state. */
function readOpenClustersFromStorage(): Set<string> | null {
  if (typeof window === "undefined") return null;
  try {
    const v2 = window.localStorage.getItem(DOCTOR_MENU_OPEN_CLUSTERS_STORAGE_KEY);
    if (v2 !== null) {
      try {
        const parsed: unknown = JSON.parse(v2);
        if (Array.isArray(parsed)) {
          // Пустой массив = пользователь явно закрыл все кластеры.
          if (parsed.length === 0) return new Set();
          const ids = parsed.filter((x): x is string => typeof x === "string" && isDoctorMenuClusterId(x));
          // Все сохранённые id устарели (например, после миграции структуры меню) →
          // вернуть null, чтобы использовался дефолт DOCTOR_MENU_DEFAULT_CLUSTER_ID.
          if (ids.length === 0) return null;
          return new Set([ids[ids.length - 1]!]);
        }
      } catch {
        /* невалидный JSON v2 — пробуем v1 */
      }
    }
    const v1 = window.localStorage.getItem(DOCTOR_MENU_OPEN_CLUSTER_STORAGE_KEY);
    if (v1 && isDoctorMenuClusterId(v1)) {
      return new Set([v1]);
    }
  } catch {
    /* ignore */
  }
  return null;
}

export type DoctorMenuAccordionProps = {
  variant: "sidebar" | "sheet";
  pathname: string;
  menuAccess: DoctorMenuAccess;
  /** Вызывается после навигации по пункту меню (например закрытие Sheet на mobile). */
  onNavigate?: () => void;
};

export function DoctorMenuAccordion({ variant, pathname, menuAccess, onNavigate }: DoctorMenuAccordionProps) {
  const linkClass = variant === "sidebar" ? SIDEBAR_LINK_CLASS : SHEET_LINK_CLASS;
  const iconSize = variant === "sidebar" ? 16 : 18;

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

  const [openClusterIds, setOpenClusterIds] = useState<Set<string>>(
    () => new Set([DOCTOR_MENU_DEFAULT_CLUSTER_ID]),
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromStorage = readOpenClustersFromStorage();
    if (fromStorage !== null) {
      setOpenClusterIds(fromStorage);
    }
  }, []);

  const toggleCluster = useCallback((id: string) => {
    setOpenClusterIds((prev) => {
      const next = prev.has(id) ? new Set<string>() : new Set([id]);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(DOCTOR_MENU_OPEN_CLUSTERS_STORAGE_KEY, JSON.stringify([...next]));
          window.localStorage.removeItem(DOCTOR_MENU_OPEN_CLUSTER_STORAGE_KEY);
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  }, []);

  // menuAccess — plain-объект, пересоздаётся в родителе при каждом ре-рендере;
  // используем примитивные поля как зависимости, чтобы избежать лишних пересчётов.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const items = useMemo(() => getDoctorMenuItems(menuAccess), [menuAccess.role, menuAccess.adminMode]);

  const renderLink = (item: DoctorMenuLinkItem, navPrefix: "sidebar" | "menu", icon?: ElementType) => {
    const href = item.href;
    // renderLink вызывается только для пунктов с href (не раскрывающихся);
    // ранний return вместо non-null assertion — безопасно и для TypeScript.
    if (!href) return null;

    const rawCount = item.badgeKey ? badgeCounts[item.badgeKey] : 0;
    const badgeText = item.badgeKey ? formatNavBadgeCount(rawCount) : null;
    const aria = badgeText ? linkAriaLabelWhenBadged(item, badgeText) : undefined;
    const Icon = icon ?? null;

    return (
      <Link
        key={item.id}
        id={navPrefix === "sidebar" ? `doctor-sidebar-link-${item.id}` : `doctor-menu-link-${item.id}`}
        href={href}
        prefetch={false}
        onClick={onNavigate}
        aria-label={aria}
        className={cn(
          linkClass,
          isDoctorNavItemActive(href, pathname) &&
            "bg-primary/15 font-medium text-primary hover:bg-primary/15 focus-visible:bg-primary/15",
        )}
      >
        <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
            {Icon && (
              <Icon
                size={iconSize}
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

  return (
    <div className={cn("flex flex-col gap-1.5", variant === "sheet" && "gap-2")}>
      {items.map((item) => {
        const navPrefix = variant === "sidebar" ? "sidebar" : "menu";

        if (!item.items) {
          // Простая ссылка верхнего уровня: рендерим с иконкой
          return renderLink(item, navPrefix, getIconForMenuId(item.id) ?? undefined);
        }

        // Раскрывающийся блок
        const open = openClusterIds.has(item.id);
        const panelId = `doctor-menu-cluster-panel-${item.id}`;
        const triggerId = `doctor-menu-cluster-trigger-${item.id}`;
        const Icon = getIconForMenuId(item.id);

        return (
          <div key={item.id} className="flex flex-col">
            <button
              type="button"
              id={triggerId}
              aria-expanded={open}
              aria-controls={panelId}
              className={CLUSTER_TRIGGER_CLASS}
              onClick={() => toggleCluster(item.id)}
            >
              <ChevronRight
                className={cn(
                  "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                  open && "rotate-90",
                )}
                strokeWidth={NAV_STRIP_ICON_STROKE}
                aria-hidden
              />
              {Icon && (
                <Icon
                  size={iconSize}
                  strokeWidth={NAV_STRIP_ICON_STROKE}
                  aria-hidden
                  className="shrink-0"
                />
              )}
              <span className="min-w-0 flex-1 text-left">{item.label}</span>
            </button>
            <div
              id={panelId}
              role="region"
              aria-labelledby={triggerId}
              className={cn("flex flex-col gap-0.5 pl-3 pr-2", open && "pb-1.5")}
            >
              {open ? item.items.map((sub) => renderLink(sub, navPrefix)) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
