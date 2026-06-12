"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { cn } from "@/lib/utils";
import {
  doctorMetricValueClass,
  doctorMetricLabelClass,
  doctorStatCardShellClass,
  doctorStatCardGridClass,
} from "@/shared/ui/doctor/doctorVisual";
import { DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS } from "@/shared/ui/doctor/doctorWorkspaceLayout";
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
import type { ScheduleKpis } from "@/modules/doctor-appointments/ports";
import type { AdminStatsTimePreset } from "@/modules/admin-platform-stats/types";

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

const PERIOD_LABELS: Record<AdminStatsTimePreset, string> = {
  day: "Сегодня",
  week: "7 дн",
  month: "30 дн",
  custom: "Период",
};

// ---------------------------------------------------------------------------
// KPI row
// ---------------------------------------------------------------------------

type KpiRowProps = {
  kpis: ScheduleKpis | null;
  period: AdminStatsTimePreset;
  onPeriodChange: (p: AdminStatsTimePreset) => void;
};

function KpiRow({ kpis, period, onPeriodChange }: KpiRowProps) {
  const PRESETS: AdminStatsTimePreset[] = ["day", "week", "month"];

  return (
    <div className={doctorStatCardGridClass} data-testid="schedule-kpi-row">
      {/* Записей за период */}
      <div className={cn(doctorStatCardShellClass)} data-testid="kpi-records">
        <p className={doctorMetricLabelClass}>Записей за период</p>
        <p className={doctorMetricValueClass}>{kpis?.recordsInPeriod ?? "—"}</p>
      </div>
      {/* Уникальных */}
      <div className={cn(doctorStatCardShellClass)} data-testid="kpi-unique">
        <p className={doctorMetricLabelClass}>Уникальных</p>
        <p className={doctorMetricValueClass}>{kpis?.uniquePatientsInPeriod ?? "—"}</p>
      </div>
      {/* Новых */}
      <div className={cn(doctorStatCardShellClass)} data-testid="kpi-new">
        <p className={doctorMetricLabelClass}>Новых</p>
        <p className={doctorMetricValueClass}>{kpis?.newPatientsInPeriod ?? "—"}</p>
      </div>
      {/* Отмены */}
      <div className={cn(doctorStatCardShellClass)} data-testid="kpi-cancellations">
        <p className={doctorMetricLabelClass}>Отмены</p>
        <p className={doctorMetricValueClass}>{kpis?.cancellationsInPeriod ?? "—"}</p>
      </div>
      {/* Переносы */}
      <div className={cn(doctorStatCardShellClass)} data-testid="kpi-reschedules">
        <p className={doctorMetricLabelClass}>Переносы</p>
        <p className={doctorMetricValueClass}>{kpis?.reschedulesInPeriod ?? "—"}</p>
      </div>
      {/* Период-селектор */}
      <div className={cn(doctorStatCardShellClass)} data-testid="kpi-period">
        <p className={doctorMetricLabelClass}>Период</p>
        <div className="flex gap-1 flex-wrap mt-0.5" role="group" aria-label="Период KPI">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPeriodChange(p)}
              aria-pressed={period === p}
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium leading-none transition-colors",
                period === p
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TabsNav
// ---------------------------------------------------------------------------

type ScheduleTabsNavProps = {
  activeTab: ScheduleTabId;
  onTabClick: (tab: ScheduleTabId) => void;
};

function ScheduleTabsNav({ activeTab, onTabClick }: ScheduleTabsNavProps) {
  return (
    <nav
      id="doctor-schedule-tabs"
      className={cn(
        "sticky z-20 -mx-3 mb-4 border-b border-border/60 bg-background/95 px-3 py-2 backdrop-blur-md supports-backdrop-filter:bg-background/90",
        DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS,
      )}
      aria-label="Разделы расписания"
    >
      <div className="flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Props & Shell
// ---------------------------------------------------------------------------

export type DoctorScheduleShellProps = {
  /** Начальный таб (от серверной страницы). */
  initialTab?: ScheduleTabId;
  /** KPI данные загруженные сервером. */
  initialKpis?: ScheduleKpis | null;
  /** Период KPI по умолчанию (из URL ?period=). */
  initialPeriod?: AdminStatsTimePreset;
};

/**
 * Клиентский контейнер-шелл «Расписание».
 *
 * Паттерн keepMounted: таб монтируется при первом открытии и скрывается (hidden)
 * при переходе на другой — без размонтирования. Переключение мгновенное.
 *
 * URL-sync: смена таба и deep-link параметров отражается в ?tab=, ?period=
 * и ключах-параметрах через history.replaceState (без полной навигации).
 * Restore при back/forward через popstate.
 */
export function DoctorScheduleShell({
  initialTab,
  initialKpis,
  initialPeriod,
}: DoctorScheduleShellProps) {
  const resolvedInit: ScheduleTabId = (() => {
    if (initialTab) return initialTab;
    if (typeof window !== "undefined") {
      return scheduleTabFromQuery(new URLSearchParams(window.location.search).get("tab"));
    }
    return SCHEDULE_DEFAULT_TAB;
  })();

  const resolvedPeriod: AdminStatsTimePreset = (() => {
    if (initialPeriod) return initialPeriod;
    if (typeof window !== "undefined") {
      const raw = new URLSearchParams(window.location.search).get("period");
      if (raw === "day" || raw === "week" || raw === "month") return raw;
    }
    return "month";
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

  const [kpis, setKpis] = useState<ScheduleKpis | null>(initialKpis ?? null);
  const [period, setPeriod] = useState<AdminStatsTimePreset>(resolvedPeriod);
  const periodRef = useRef(period);

  // ── sync refs ──────────────────────────────────────────────────────────────

  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { deepLinksRef.current = deepLinks; }, [deepLinks]);
  useEffect(() => { periodRef.current = period; }, [period]);

  // ── back/forward restore ───────────────────────────────────────────────────

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const tab = scheduleTabFromQuery(params.get("tab"));
      const rawPeriod = params.get("period");
      const nextPeriod: AdminStatsTimePreset =
        rawPeriod === "day" || rawPeriod === "week" || rawPeriod === "month" ? rawPeriod : "month";
      setActiveTab(tab);
      setMountedTabs((prev) => new Set([...prev, tab]));
      setDeepLinks(readDeepLinksFromSearchParams(params));
      setPeriod(nextPeriod);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // ── period KPI fetch ───────────────────────────────────────────────────────
  // When period changes (and tab is active), re-fetch KPIs via the page reload
  // with ?period= in URL (server RSC re-render) OR via client fetch from API.
  // Strategy: use router.replace → full page re-render for freshness, no client API needed.
  // We do a lightweight client fetch instead to avoid full navigation (better UX).
  const loadKpis = useCallback(async (p: AdminStatsTimePreset) => {
    try {
      const res = await fetch(`/api/doctor/schedule-kpis?period=${p}`);
      if (!res.ok) return;
      const json = (await res.json()) as { ok: boolean; kpis: ScheduleKpis };
      if (json.ok && json.kpis) setKpis(json.kpis);
    } catch {
      // silently ignore — show last known KPIs
    }
  }, []);

  // ── URL builder ───────────────────────────────────────────────────────────

  const buildTabUrl = useCallback(
    (
      tabId: ScheduleTabId,
      tabDeepLinks: Record<string, string>,
      currentPeriod: AdminStatsTimePreset,
    ): string => {
      const params = new URLSearchParams({ tab: tabId });
      if (currentPeriod !== "month") params.set("period", currentPeriod);
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
        buildTabUrl(tabId, deepLinksRef.current[tabId] ?? {}, periodRef.current),
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
            buildTabUrl(tabId, tabParams, periodRef.current),
          );
        }
        return next;
      });
    },
    [buildTabUrl],
  );

  // ── period change ─────────────────────────────────────────────────────────

  const handlePeriodChange = useCallback(
    (p: AdminStatsTimePreset) => {
      setPeriod(p);
      periodRef.current = p;
      window.history.replaceState(
        null,
        "",
        buildTabUrl(activeTabRef.current, deepLinksRef.current[activeTabRef.current] ?? {}, p),
      );
      void loadKpis(p);
    },
    [buildTabUrl, loadKpis],
  );

  return (
    <DoctorAppShell title="Расписание">
      <KpiRow kpis={kpis} period={period} onPeriodChange={handlePeriodChange} />
      <ScheduleTabsNav activeTab={activeTab} onTabClick={handleTabChange} />
      {SCHEDULE_TAB_REGISTRY.map((entry) => {
        if (!mountedTabs.has(entry.id)) return null;
        const TabComponent = DYNAMIC_TABS.get(entry.id)!;
        const tabId = entry.id;
        return (
          <div key={tabId} hidden={tabId !== activeTab} data-testid={`tab-panel-${tabId}`}>
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
