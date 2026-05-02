"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DOCTOR_MENU_DEFAULT_CLUSTER_ID,
  DOCTOR_MENU_OPEN_CLUSTER_STORAGE_KEY,
  getDoctorMenuRenderSections,
  isDoctorMenuClusterId,
  isDoctorNavItemActive,
  type DoctorMenuLinkItem,
} from "@/shared/ui/doctorNavLinks";

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

  const renderLink = (item: DoctorMenuLinkItem, navPrefix: "sidebar" | "menu") => (
    <Link
      key={item.id}
      id={navPrefix === "sidebar" ? `doctor-sidebar-link-${item.id}` : `doctor-menu-link-${item.id}`}
      href={item.href}
      prefetch={false}
      onClick={onNavigate}
      className={cn(linkClass, isDoctorNavItemActive(item.href, pathname) && "bg-muted font-medium text-foreground")}
    >
      {item.label}
    </Link>
  );

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
