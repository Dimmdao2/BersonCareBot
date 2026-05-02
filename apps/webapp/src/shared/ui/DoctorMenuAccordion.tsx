"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDoctorOnlineIntakeNewCount } from "@/modules/online-intake/hooks/useDoctorOnlineIntakeNewCount";
import { useDoctorSupportUnreadCount } from "@/shared/hooks/useSupportUnreadPolling";
import {
  DOCTOR_MENU_DEFAULT_CLUSTER_ID,
  DOCTOR_MENU_OPEN_CLUSTER_STORAGE_KEY,
  getDoctorMenuRenderSections,
  isDoctorMenuClusterId,
  isDoctorNavItemActive,
  type DoctorMenuBadgeKey,
  type DoctorMenuLinkItem,
} from "@/shared/ui/doctorNavLinks";

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
  "h-auto w-full justify-start px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground",
);

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

  const [openClusterId, setOpenClusterId] = useState<string>(DOCTOR_MENU_DEFAULT_CLUSTER_ID);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(DOCTOR_MENU_OPEN_CLUSTER_STORAGE_KEY);
      if (raw && isDoctorMenuClusterId(raw)) {
        // Hydration: server и первый клиентский paint совпадают с default; затем подтягиваем сохранённый кластер.
        // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional post-mount read from localStorage
        setOpenClusterId(raw);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persistOpenCluster = useCallback((id: string) => {
    setOpenClusterId(id);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(DOCTOR_MENU_OPEN_CLUSTER_STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

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
        className={cn(linkClass, isDoctorNavItemActive(item.href, pathname) && "bg-muted font-medium text-foreground")}
      >
        <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <span className="min-w-0 flex-1 text-left">{item.label}</span>
          {badgeText && item.badgeKey ? (
            <span
              className={cn(
                "inline-flex min-h-[1.25rem] min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums leading-none text-muted-foreground",
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
    <div className={cn("flex flex-col gap-0.5", variant === "sheet" && "gap-1")}>
      {sections.map((section) => {
        if (section.type === "standalone") {
          return (
            <div key="standalone-library" className="flex flex-col gap-0.5">
              {section.links.map((item) => renderLink(item, variant === "sidebar" ? "sidebar" : "menu"))}
            </div>
          );
        }

        const { cluster } = section;
        const open = openClusterId === cluster.id;
        const panelId = `doctor-menu-cluster-panel-${cluster.id}`;
        const triggerId = `doctor-menu-cluster-trigger-${cluster.id}`;

        return (
          <div key={cluster.id} className="flex flex-col gap-0.5">
            <button
              type="button"
              id={triggerId}
              aria-expanded={open}
              aria-controls={panelId}
              className={CLUSTER_TRIGGER_CLASS}
              onClick={() => persistOpenCluster(cluster.id)}
            >
              {cluster.label}
            </button>
            <div id={panelId} role="region" aria-labelledby={triggerId} className="flex flex-col gap-0.5 pl-0">
              {open ? cluster.items.map((item) => renderLink(item, variant === "sidebar" ? "sidebar" : "menu")) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
