"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorPageHeader } from "@/shared/ui/doctor/shell/DoctorPageHeader";
import { cn } from "@/lib/utils";
import {
  SCHEDULE_BASE,
  SCHEDULE_TABS,
  SCHEDULE_DEFAULT_TAB,
  scheduleTabFromQuery,
  type ScheduleTabId,
} from "./doctorScheduleTabs";
import {
  SCHEDULE_TAB_REGISTRY,
  type ScheduleTabProps,
} from "./scheduleTabRegistry";

// ---------------------------------------------------------------------------
// Dynamic tab components — built once per module load
// ---------------------------------------------------------------------------

const DYNAMIC_TABS = new Map<ScheduleTabId, ComponentType<ScheduleTabProps>>(
  SCHEDULE_TAB_REGISTRY.map((entry) => [
    entry.id,
    dynamic(entry.loader, { ssr: false }) as ComponentType<ScheduleTabProps>,
  ]),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readDeepLinksFromSearchParams(
  params: URLSearchParams,
): Partial<Record<ScheduleTabId, Record<string, string>>> {
  const initial: Partial<Record<ScheduleTabId, Record<string, string>>> = {};
  for (const entry of SCHEDULE_TAB_REGISTRY) {
    const tabParams: Record<string, string> = {};
    for (const key of entry.deepLinkKeys) {
      const val = params.get(key);
      if (val) tabParams[key] = val;
    }
    if (Object.keys(tabParams).length > 0) {
      initial[entry.id] = tabParams;
    }
  }
  return initial;
}

// ---------------------------------------------------------------------------
// TabsNav
// ---------------------------------------------------------------------------

type ScheduleTabsNavProps = {
  activeTab: ScheduleTabId;
  onTabClick: (tab: ScheduleTabId) => void;
};

function ScheduleTabsNav({ activeTab, onTabClick }: ScheduleTabsNavProps) {
  // Табы живут в слоте `tabs` per-page шапки DoctorPageHeader (единый sticky-заголовок,
  // без отдельной липкой полосы и двойного бордера). Здесь — только ряд кнопок.
  return (
    <div
      id="doctor-schedule-tabs"
      aria-label="Разделы расписания"
      className="flex gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {SCHEDULE_TABS.map((tab) => {
        const active = tab.id === activeTab;
        const itemClass = cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
          active
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        );
        return (
          <button
            key={tab.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onTabClick(tab.id)}
            className={itemClass}
            data-testid={`tab-btn-${tab.id}`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props & Shell
// ---------------------------------------------------------------------------

export type DoctorScheduleShellProps = {
  /** Начальный таб (от серверной страницы). */
  initialTab?: ScheduleTabId;
};

/**
 * Клиентский контейнер-шелл «Расписание».
 *
 * Паттерн keepMounted: таб монтируется при первом открытии и скрывается (hidden)
 * при переходе на другой — без размонтирования. Переключение мгновенное.
 *
 * URL-sync: смена таба и deep-link параметров отражается в ?tab= и ключах-параметрах
 * через history.replaceState (без полной навигации).
 * Restore при back/forward через popstate.
 *
 * KPI (9 метрик) живут только внутри таба «Записи» (ScheduleCalendarTab) и загружаются
 * там же; шелл не знает о KPI (§3.1 ТЗ).
 */
export function DoctorScheduleShell({
  initialTab,
}: DoctorScheduleShellProps) {
  const resolvedInit: ScheduleTabId = (() => {
    if (initialTab) return initialTab;
    if (typeof window !== "undefined") {
      return scheduleTabFromQuery(new URLSearchParams(window.location.search).get("tab"));
    }
    return SCHEDULE_DEFAULT_TAB;
  })();

  const [activeTab, setActiveTab] = useState<ScheduleTabId>(resolvedInit);
  const activeTabRef = useRef(activeTab);

  const [mountedTabs, setMountedTabs] = useState<ReadonlySet<ScheduleTabId>>(
    () => new Set<ScheduleTabId>([resolvedInit]),
  );

  const [deepLinks, setDeepLinks] = useState<
    Partial<Record<ScheduleTabId, Record<string, string>>>
  >(() =>
    typeof window !== "undefined"
      ? readDeepLinksFromSearchParams(new URLSearchParams(window.location.search))
      : {},
  );
  const deepLinksRef = useRef(deepLinks);

  // ── sync refs ──────────────────────────────────────────────────────────────

  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { deepLinksRef.current = deepLinks; }, [deepLinks]);

  // ── back/forward restore ───────────────────────────────────────────────────

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const tab = scheduleTabFromQuery(params.get("tab"));
      setActiveTab(tab);
      setMountedTabs((prev) => new Set([...prev, tab]));
      setDeepLinks(readDeepLinksFromSearchParams(params));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // ── URL builder ───────────────────────────────────────────────────────────

  const buildTabUrl = useCallback(
    (
      tabId: ScheduleTabId,
      tabDeepLinks: Record<string, string>,
    ): string => {
      const params = new URLSearchParams({ tab: tabId });
      for (const [k, v] of Object.entries(tabDeepLinks)) {
        if (v) params.set(k, v);
      }
      return `${SCHEDULE_BASE}?${params.toString()}`;
    },
    [],
  );

  // ── tab switching ─────────────────────────────────────────────────────────

  const handleTabChange = useCallback(
    (tabId: ScheduleTabId) => {
      setActiveTab(tabId);
      setMountedTabs((prev) => new Set([...prev, tabId]));
      window.history.replaceState(
        null,
        "",
        buildTabUrl(tabId, deepLinksRef.current[tabId] ?? {}),
      );
    },
    [buildTabUrl],
  );

  // ── deep-link change ──────────────────────────────────────────────────────

  const handleDeepLinkChange = useCallback(
    (tabId: ScheduleTabId, key: string, value: string | null) => {
      setDeepLinks((prev) => {
        const tabParams = { ...(prev[tabId] ?? {}) };
        if (value === null) delete tabParams[key];
        else tabParams[key] = value;
        const next = { ...prev, [tabId]: tabParams };
        deepLinksRef.current = next;
        if (activeTabRef.current === tabId) {
          window.history.replaceState(
            null,
            "",
            buildTabUrl(tabId, tabParams),
          );
        }
        return next;
      });
    },
    [buildTabUrl],
  );

  return (
    <DoctorAppShell title="Расписание" layout="full-height">
      <DoctorPageHeader
        id="doctor-schedule-header"
        title="Расписание"
        tabs={<ScheduleTabsNav activeTab={activeTab} onTabClick={handleTabChange} />}
      />
      {SCHEDULE_TAB_REGISTRY.map((entry) => {
        if (!mountedTabs.has(entry.id)) return null;
        const TabComponent = DYNAMIC_TABS.get(entry.id)!;
        const tabId = entry.id;
        return (
          <div key={tabId} hidden={tabId !== activeTab} className="flex min-h-0 flex-1 flex-col" data-testid={`tab-panel-${tabId}`}>
            <TabComponent
              deepLinkParams={deepLinks[tabId] ?? {}}
              onDeepLinkChange={(key, value) => handleDeepLinkChange(tabId, key, value)}
              initialData={undefined}
              isActive={tabId === activeTab}
            />
          </div>
        );
      })}
    </DoctorAppShell>
  );
}
