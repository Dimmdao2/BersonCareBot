'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/shared/ui/doctor/primitives/button';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { doctorSectionTabClass } from '@/shared/ui/doctor/DoctorSectionTabs';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';

import {
  ANALYTICS_BASE,
  ANALYTICS_DEFAULT_TAB,
  ANALYTICS_TABS,
  analyticsTabFromQuery,
  type AnalyticsTabId,
} from './doctorAnalyticsTabs';

// Каждый таб тянется лениво при первом открытии (ssr:false) — тот же паттерн, что у
// DoctorScheduleShell/старого DoctorAnalyticsShell, один tab-sync механизм на весь кабинет.
const RecordsTab = dynamic(
  () => import('./records/RecordsAnalyticsTab').then((m) => ({ default: m.RecordsAnalyticsTab })),
  { ssr: false },
);
const ActivityTab = dynamic(
  () =>
    import('./activity/ActivityAnalyticsTab').then((m) => ({ default: m.ActivityAnalyticsTab })),
  { ssr: false },
);

type AnalyticsTabsNavProps = {
  activeTab: AnalyticsTabId;
  onTabClick: (tab: AnalyticsTabId) => void;
};

function AnalyticsTabsNav({ activeTab, onTabClick }: AnalyticsTabsNavProps) {
  return (
    <div
      id="doctor-analytics-tabs"
      aria-label="Разделы аналитики"
      className="flex gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {ANALYTICS_TABS.map((tab) => {
        const active = tab.id === activeTab;
        return (
          <Button
            key={tab.id}
            type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => onTabClick(tab.id)}
            variant={active ? 'default' : 'ghost'}
            className={doctorSectionTabClass(active)}
            data-testid={`tab-btn-${tab.id}`}
          >
            {tab.label}
          </Button>
        );
      })}
    </div>
  );
}

export type DoctorAnalyticsShellProps = {
  /** Начальный таб (от серверной страницы, по `?tab=`). */
  initialTab?: AnalyticsTabId;
  calendarTodayYmd: string;
  displayIana: string;
  /** Родительный падеж мн.ч. из настройки patient_label: «пациентов» или «клиентов». */
  patientGenPlural?: string;
};

/**
 * Клиентский контейнер-шелл «Аналитика» кабинета врача — две вкладки: Записи · Активность.
 * Tenant/visibility-scoped (обе вкладки читают через doctor-scoped API, см. брифы
 * `/api/doctor/analytics/records` и `/api/doctor/analytics/activity`).
 *
 * Паттерн keepMounted (как в `DoctorScheduleShell`): таб монтируется при первом открытии и
 * скрывается (`hidden`) при переходе на другой, без размонтирования. Смена таба отражается в
 * `?tab=` через `history.replaceState` (без полной навигации); back/forward — через popstate.
 */
export function DoctorAnalyticsShell({
  initialTab,
  calendarTodayYmd,
  displayIana,
  patientGenPlural,
}: DoctorAnalyticsShellProps) {
  const [activeTab, setActiveTab] = useState<AnalyticsTabId>(initialTab ?? ANALYTICS_DEFAULT_TAB);
  const [mountedTabs, setMountedTabs] = useState<ReadonlySet<AnalyticsTabId>>(
    () => new Set<AnalyticsTabId>([initialTab ?? ANALYTICS_DEFAULT_TAB]),
  );
  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    const handlePopState = () => {
      const tab = analyticsTabFromQuery(new URLSearchParams(window.location.search).get('tab'));
      setActiveTab(tab);
      setMountedTabs((prev) => new Set([...prev, tab]));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleTabChange = useCallback((tabId: AnalyticsTabId) => {
    setActiveTab(tabId);
    setMountedTabs((prev) => new Set([...prev, tabId]));
    window.history.replaceState(null, '', `${ANALYTICS_BASE}?tab=${tabId}`);
  }, []);

  return (
    <DoctorAppShell title="Аналитика">
      <DoctorPageHeader
        id="doctor-analytics-header"
        title="Аналитика"
        showTabsOnMobile
        tabs={<AnalyticsTabsNav activeTab={activeTab} onTabClick={handleTabChange} />}
      />
      {mountedTabs.has('records') ? (
        <div hidden={activeTab !== 'records'} data-testid="tab-panel-records">
          <RecordsTab
            calendarTodayYmd={calendarTodayYmd}
            displayIana={displayIana}
            patientGenPlural={patientGenPlural}
          />
        </div>
      ) : null}
      {mountedTabs.has('activity') ? (
        <div hidden={activeTab !== 'activity'} data-testid="tab-panel-activity">
          <ActivityTab
            calendarTodayYmd={calendarTodayYmd}
            displayIana={displayIana}
            patientGenPlural={patientGenPlural}
          />
        </div>
      ) : null}
    </DoctorAppShell>
  );
}
