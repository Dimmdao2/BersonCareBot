"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDoctorOnlineIntakeNewCount } from "@/modules/online-intake/hooks/useDoctorOnlineIntakeNewCount";
import { useDoctorSupportUnreadCount } from "@/shared/hooks/useSupportUnreadPolling";
import {
  DOCTOR_MENU_DEFAULT_CLUSTER_ID,
  DOCTOR_MENU_OPEN_CLUSTER_STORAGE_KEY,
  DOCTOR_MENU_OPEN_CLUSTERS_STORAGE_KEY,
  getDoctorMenuRenderSections,
  isDoctorMenuClusterId,
  isDoctorNavItemActive,
  type DoctorMenuBadgeKey,
  type DoctorMenuLinkItem,
} from "@/shared/ui/doctorNavLinks";
import { NAV_STRIP_ICON_STROKE } from "@/shared/ui/navChrome";

/** Отображаемый текст бейджа; `null` — не показывать. */
export function formatNavBadgeCount(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 100) return "99+";
  return String(Math.floor(n));
}

function badgeSpanAriaLabel(badgeKey: DoctorMenuBadgeKey, formatted: string): string {
  return badgeKey === "onlineIntakeNew"
    ? `Новых заявок: ${formatted}`
    : `Непрочитанных сообщений: ${formatted}`;
}

function linkAriaLabelWhenBadged(item: DoctorMenuLinkItem, formatted: string): string | undefined {
  if (!item.badgeKey || !formatted) return undefined;
  return item.badgeKey === "onlineIntakeNew"
    ? `${item.label}. Новых заявок: ${formatted}.`
    : `${item.label}. Непрочитанных сообщений: ${formatted}.`;
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
  "flex h-auto w-full items-center justify-start gap-2 rounded-t-md bg-white px-3 py-2 text-left text-sm font-semibold text-foreground hover:bg-zinc-100/90",
);

/** Читает набор открытых кластеров: новый JSON-массив, иначе миграция со старого одного id. `null` — оставить начальный state. */
function readOpenClustersFromStorage(): Set<string> | null {
  if (typeof window === "undefined") return null;
  try {
    const v2 = window.localStorage.getItem(DOCTOR_MENU_OPEN_CLUSTERS_STORAGE_KEY);
    if (v2 !== null) {
      try {
        const parsed: unknown = JSON.parse(v2);
        if (Array.isArray(parsed)) {
          const ids = parsed.filter((x): x is string => typeof x === "string" && isDoctorMenuClusterId(x));
          return new Set(ids);
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
  /** Вызывается после навигации по пункту меню (например закрытие Sheet на mobile). */
  onNavigate?: () => void;
};

export function DoctorMenuAccordion({ variant, pathname, onNavigate }: DoctorMenuAccordionProps) {
  const linkClass = variant === "sidebar" ? SIDEBAR_LINK_CLASS : SHEET_LINK_CLASS;

  const messagesUnread = useDoctorSupportUnreadCount();
  const onlineIntakeNew = useDoctorOnlineIntakeNewCount();

  const badgeCounts = useMemo(
    () =>
      ({
        onlineIntakeNew,
        messagesUnread,
      }) satisfies Record<DoctorMenuBadgeKey, number>,
    [onlineIntakeNew, messagesUnread],
  );

  const [openClusterIds, setOpenClusterIds] = useState<Set<string>>(
    () => new Set([DOCTOR_MENU_DEFAULT_CLUSTER_ID]),
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromStorage = readOpenClustersFromStorage();
    if (fromStorage !== null) {
      // Hydration: затем подтягиваем сохранённый набор открытых кластеров (или миграция с v1).
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional post-mount read from localStorage
      setOpenClusterIds(fromStorage);
    }
  }, []);

  const toggleCluster = useCallback(
    (id: string) => {
      setOpenClusterIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
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
    },
    [],
  );

  const sections = getDoctorMenuRenderSections();

  const renderLink = (item: DoctorMenuLinkItem, navPrefix: "sidebar" | "menu") => {
    const rawCount = item.badgeKey ? badgeCounts[item.badgeKey] : 0;
    const badgeText = item.badgeKey ? formatNavBadgeCount(rawCount) : null;
    const aria = badgeText ? linkAriaLabelWhenBadged(item, badgeText) : undefined;

    return (
      <Link
        key={item.id}
        id={navPrefix === "sidebar" ? `doctor-sidebar-link-${item.id}` : `doctor-menu-link-${item.id}`}
        href={item.href}
        prefetch={false}
        onClick={onNavigate}
        aria-label={aria}
        className={cn(
          linkClass,
          isDoctorNavItemActive(item.href, pathname) &&
            "bg-[#7ea1d1] font-normal text-foreground hover:bg-[#7ea1d1] focus-visible:bg-[#7ea1d1]",
        )}
      >
        <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <span className="min-w-0 flex-1 text-left">{item.label}</span>
          {badgeText && item.badgeKey ? (
            <span
              className={cn(
                "inline-flex min-h-[1.25rem] min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums leading-none text-muted-foreground",
              )}
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
      {sections.map((section) => {
        if (section.type === "standalone") {
          return (
            <div key="standalone-library" className="flex flex-col gap-0.5">
              {section.links.map((item) => renderLink(item, variant === "sidebar" ? "sidebar" : "menu"))}
            </div>
          );
        }

        const { cluster } = section;
        const open = openClusterIds.has(cluster.id);
        const panelId = `doctor-menu-cluster-panel-${cluster.id}`;
        const triggerId = `doctor-menu-cluster-trigger-${cluster.id}`;

        return (
          <div
            key={cluster.id}
            className="flex flex-col rounded-md border border-muted-foreground/30"
          >
            <button
              type="button"
              id={triggerId}
              aria-expanded={open}
              aria-controls={panelId}
              className={CLUSTER_TRIGGER_CLASS}
              onClick={() => toggleCluster(cluster.id)}
            >
              <ChevronRight
                className={cn(
                  "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                  open && "rotate-90",
                )}
                strokeWidth={NAV_STRIP_ICON_STROKE}
                aria-hidden
              />
              <span className="min-w-0 flex-1 text-left">{cluster.label}</span>
            </button>
            <div
              id={panelId}
              role="region"
              aria-labelledby={triggerId}
              className={cn("flex flex-col gap-0.5 pl-3 pr-2", open && "pb-1.5")}
            >
              {open ? cluster.items.map((item) => renderLink(item, variant === "sidebar" ? "sidebar" : "menu")) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
