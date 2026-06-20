"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ClientContactBreakdown } from "@/modules/doctor-clients/clientContactSegments";
import { cn } from "@/lib/utils";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorPageHeader } from "@/shared/ui/doctor/shell/DoctorPageHeader";

import {
  ANALYTICS_BASE,
  ANALYTICS_DEFAULT_TAB,
  ANALYTICS_TABS,
  analyticsTabFromQuery,
  type AnalyticsTabId,
} from "./doctorAnalyticsTabs";

// ---------------------------------------------------------------------------
// Dynamic tab content — каждый таб тянется лениво при первом открытии (ssr:false).
// Клиенты получают SSR-данные среза (см. clientsData); остальные табы самозагружаются.
// ---------------------------------------------------------------------------

const ClientsTab = dynamic(
  () =>
    import("./clients/DoctorAnalyticsClientsPageClient").then((m) => ({
      default: m.DoctorAnalyticsClientsPageClient,
    })),
  { ssr: false },
);
const ContentTab = dynamic(
  () => import("./tabs/AnalyticsContentTab").then((m) => ({ default: m.AnalyticsContentTab })),
  { ssr: false },
);
const AppTab = dynamic(
  () =>
    import("../usage/ProductAnalyticsSection").then((m) => ({
      default: m.ProductAnalyticsSection,
    })),
  { ssr: false },
);
// Уведомления (push-статистика) перенесены в таб «Приложение» — рендерятся под ProductAnalyticsSection.
const NotificationsInAppTab = dynamic(
  () =>
    import("./notifications/NotificationsAnalyticsClient").then((m) => ({
      default: m.NotificationsAnalyticsClient,
    })),
  { ssr: false },
);
const RegistrationInAppTab = dynamic(
  () =>
    import("./clients/RegistrationStatsAppTabWrapper").then((m) => ({
      default: m.RegistrationStatsAppTabWrapper,
    })),
  { ssr: false },
);
// Подписчики приложения (C1/C2) — перенесены из вкладки «Клиенты» (AN-11):
// подписчики ≠ клиенты (§24.6/24.9), это аудитория приложения.
const SubscribersInAppTab = dynamic(
  () =>
    import("./clients/SubscriberStatsAppTabWrapper").then((m) => ({
      default: m.SubscriberStatsAppTabWrapper,
    })),
  { ssr: false },
);
const SoprovozhdeniePage = dynamic(
  () =>
    import("./soprovozhdenie/SoprovozhdeniePage").then((m) => ({
      default: m.SoprovozhdeniePage,
    })),
  { ssr: false },
);

/** SSR-срез для вкладки «Клиенты» (список не зависит от периода тулбара). */
export type AnalyticsClientsData = {
  calendarTodayYmd: string;
  displayIana: string;
  clients: {
    total: number;
    phoneOnly: number;
    appGuests: number;
    patientsCount: number;
    subscribersOnlyCount: number;
    contactBreakdown: ClientContactBreakdown;
  };
};

// ---------------------------------------------------------------------------
// TabsNav — ряд кнопок в слоте `tabs` шапки DoctorPageHeader (как в Расписании).
// ---------------------------------------------------------------------------

type AnalyticsTabsNavProps = {
  activeTab: AnalyticsTabId;
  onTabClick: (tab: AnalyticsTabId) => void;
  clientsLabel?: string;
};

function AnalyticsTabsNav({ activeTab, onTabClick, clientsLabel }: AnalyticsTabsNavProps) {
  return (
    <div
      id="doctor-analytics-tabs"
      aria-label="Разделы аналитики"
      className="flex gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {ANALYTICS_TABS.map((tab) => {
        const active = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onTabClick(tab.id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            data-testid={`tab-btn-${tab.id}`}
          >
            {tab.id === "clients" && clientsLabel ? clientsLabel : tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export type DoctorAnalyticsShellProps = {
  /** Начальный таб (от серверной страницы, по `?tab=`). */
  initialTab?: AnalyticsTabId;
  /** SSR-срез для вкладки «Клиенты». */
  clientsData: AnalyticsClientsData;
  /** Именование клиентов из настройки patient_label: «Клиенты» или «Пациенты». */
  patientPluralLabel?: string;
  /** Генитив мн.ч. из той же настройки: «клиентов» или «пациентов». */
  patientGenPlural?: string;
};

/**
 * Клиентский контейнер-шелл «Аналитика» — одна страница, четыре вкладки:
 * Клиенты · Приложение (+ push) · Контент · Сопровождение.
 *
 * Паттерн keepMounted (как в `DoctorScheduleShell`): таб монтируется при первом
 * открытии и скрывается (`hidden`) при переходе на другой, без размонтирования.
 * Переключение мгновенное. Смена таба отражается в `?tab=` через
 * `history.replaceState` (без полной навигации); back/forward — через popstate.
 *
 * S4.2: вкладка «Уведомления» упразднена — push-статистика включена в «Приложение».
 * Добавлена вкладка «Сопровождение» (placeholder, метрики будут расширены).
 */
export function DoctorAnalyticsShell({ initialTab, clientsData, patientPluralLabel, patientGenPlural }: DoctorAnalyticsShellProps) {
  const resolvedInit: AnalyticsTabId = (() => {
    if (initialTab) return initialTab;
    if (typeof window !== "undefined") {
      return analyticsTabFromQuery(new URLSearchParams(window.location.search).get("tab"));
    }
    return ANALYTICS_DEFAULT_TAB;
  })();

  const [activeTab, setActiveTab] = useState<AnalyticsTabId>(resolvedInit);
  const [mountedTabs, setMountedTabs] = useState<ReadonlySet<AnalyticsTabId>>(
    () => new Set<AnalyticsTabId>([resolvedInit]),
  );
  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  // back/forward restore
  useEffect(() => {
    const handlePopState = () => {
      const tab = analyticsTabFromQuery(new URLSearchParams(window.location.search).get("tab"));
      setActiveTab(tab);
      setMountedTabs((prev) => new Set([...prev, tab]));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleTabChange = useCallback((tabId: AnalyticsTabId) => {
    setActiveTab(tabId);
    setMountedTabs((prev) => new Set([...prev, tabId]));
    window.history.replaceState(null, "", `${ANALYTICS_BASE}?tab=${tabId}`);
  }, []);

  return (
    <DoctorAppShell title="Аналитика">
      <DoctorPageHeader
        id="doctor-analytics-header"
        title="Аналитика"
        tabs={<AnalyticsTabsNav activeTab={activeTab} onTabClick={handleTabChange} clientsLabel={patientPluralLabel} />}
      />
      {mountedTabs.has("clients") ? (
        <div hidden={activeTab !== "clients"} data-testid="tab-panel-clients">
          <ClientsTab
            calendarTodayYmd={clientsData.calendarTodayYmd}
            displayIana={clientsData.displayIana}
            clients={clientsData.clients}
            patientPluralLabel={patientPluralLabel}
            patientGenPlural={patientGenPlural}
          />
        </div>
      ) : null}
      {mountedTabs.has("app") ? (
        <div hidden={activeTab !== "app"} data-testid="tab-panel-app">
          <div className="flex flex-col gap-6">
            <AppTab />
            {/* Push-статистика и уведомления — перенесены из упразднённой вкладки «Уведомления» */}
            <NotificationsInAppTab />
            {/* Регистрации и слияния — перенесены из вкладки «Клиенты» (AN-03) */}
            <RegistrationInAppTab />
            {/* Подписчики — перенесены из вкладки «Клиенты» (AN-11): подписчики ≠ клиенты */}
            <SubscribersInAppTab />
          </div>
        </div>
      ) : null}
      {mountedTabs.has("content") ? (
        <div hidden={activeTab !== "content"} data-testid="tab-panel-content">
          <ContentTab />
        </div>
      ) : null}
      {mountedTabs.has("soprovozhdenie") ? (
        <div hidden={activeTab !== "soprovozhdenie"} data-testid="tab-panel-soprovozhdenie">
          <SoprovozhdeniePage patientGenPlural={patientGenPlural} />
        </div>
      ) : null}
    </DoctorAppShell>
  );
}
