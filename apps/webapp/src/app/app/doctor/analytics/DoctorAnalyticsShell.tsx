'use client';

import dynamic from 'next/dynamic';
import { DateTime } from 'luxon';
import { Check, MapPin } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMemo } from 'react';

import { cn } from '@/lib/utils';
import type { AdminStatsTimePreset } from '@/modules/admin-platform-stats/types';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
import { doctorSectionTabClass } from '@/shared/ui/doctor/DoctorSectionTabs';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { DoctorMobileSectionTabs } from '@/shared/ui/doctor/shell/DoctorMobileSectionTabs';
import {
  DOCTOR_ACTIVE_FILTER_BUTTON_CLASS,
  DOCTOR_SCHEDULE_TOOLBAR_CONTROL_CLASS,
  DOCTOR_SCHEDULE_TOOLBAR_ICON_CONTROL_CLASS,
} from '@/shared/ui/doctor/calendar/DoctorSchedulePeriodNav';
import {
  DOCTOR_DESKTOP_ATTACH_TO_PAGE_HEADER_CLASS,
  DOCTOR_REMAINING_HEIGHT_BODY_CLASS,
} from '@/shared/ui/doctor/doctorWorkspaceLayout';

import { AnalyticsPeriodToolbar } from './clients/AnalyticsPeriodToolbar';
import {
  resolveAnalyticsPeriodLabel,
  validateCustomAnalyticsPeriod,
  ymdMinusDays,
  type AnalyticsPeriodValue,
} from './clients/analyticsPeriodUi';
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
const FinanceTab = dynamic(
  () => import('./finance/FinanceAnalyticsTab').then((m) => ({ default: m.FinanceAnalyticsTab })),
  { ssr: false },
);
const MaterialsTab = dynamic(
  () =>
    import('./materials/MaterialsAnalyticsTab').then((m) => ({ default: m.MaterialsAnalyticsTab })),
  { ssr: false },
);

type AnalyticsBranch = {
  id: string;
  title: string;
  shortTitle: string | null;
  color: string | null;
  isActive: boolean;
};

type BookingOverviewResponse = {
  ok?: boolean;
  branches?: AnalyticsBranch[];
};

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
 * Клиентский контейнер-шелл «Аналитика» кабинета врача.
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
  const [draftPeriod, setDraftPeriod] = useState<AnalyticsPeriodValue>({
    preset: 'week',
    customFrom: '',
    customTo: '',
  });
  const [appliedPeriod, setAppliedPeriod] = useState<AnalyticsPeriodValue>(draftPeriod);
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [periodReady, setPeriodReady] = useState(true);
  const [branches, setBranches] = useState<AnalyticsBranch[]>([]);
  const [locationFilter, setLocationFilter] = useState<string | null>(null);
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);
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

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/doctor/booking-engine/overview', { cache: 'no-store' })
      .then((res) => res.json() as Promise<BookingOverviewResponse>)
      .then((json) => {
        if (!cancelled && json.ok) setBranches((json.branches ?? []).filter((b) => b.isActive));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const handleTabChange = useCallback((tabId: AnalyticsTabId) => {
    setActiveTab(tabId);
    setMountedTabs((prev) => new Set([...prev, tabId]));
    window.history.replaceState(null, '', `${ANALYTICS_BASE}?tab=${tabId}`);
  }, []);

  const applyPeriod = useCallback((next: AnalyticsPeriodValue) => {
    const error = validateCustomAnalyticsPeriod(next);
    setPeriodError(error);
    setPeriodReady(!error);
    if (!error) setAppliedPeriod(next);
  }, []);

  const handlePresetChange = useCallback(
    (preset: AdminStatsTimePreset) => {
      if (preset === 'custom') {
        const today =
          calendarTodayYmd.trim() || DateTime.now().setZone(displayIana).toISODate() || '';
        const next = {
          preset,
          customFrom: draftPeriod.customFrom || ymdMinusDays(today, 6),
          customTo: draftPeriod.customTo || today,
        } satisfies AnalyticsPeriodValue;
        setDraftPeriod(next);
        applyPeriod(next);
        return;
      }
      const next = { preset, customFrom: '', customTo: '' } satisfies AnalyticsPeriodValue;
      setDraftPeriod(next);
      applyPeriod(next);
    },
    [applyPeriod, calendarTodayYmd, displayIana, draftPeriod.customFrom, draftPeriod.customTo],
  );

  const periodLabel = useMemo(
    () => resolveAnalyticsPeriodLabel(displayIana, appliedPeriod),
    [appliedPeriod, displayIana],
  );
  const activeBranch = branches.find((branch) => branch.id === locationFilter) ?? null;
  const branchFilterAvailable = activeTab === 'records' || activeTab === 'finance';

  const branchPicker = branchFilterAvailable ? (
    <Button
      type="button"
      size="icon"
      variant="outline"
      className={cn(
        DOCTOR_SCHEDULE_TOOLBAR_ICON_CONTROL_CLASS,
        locationFilter ? DOCTOR_ACTIVE_FILTER_BUTTON_CLASS : DOCTOR_SCHEDULE_TOOLBAR_CONTROL_CLASS,
      )}
      onClick={() => setBranchPickerOpen(true)}
      aria-label={
        locationFilter === 'online'
          ? 'Онлайн'
          : activeBranch
            ? `Филиал: ${activeBranch.shortTitle ?? activeBranch.title}`
            : 'Все филиалы'
      }
      title={
        locationFilter === 'online'
          ? 'Онлайн'
          : (activeBranch?.shortTitle ?? activeBranch?.title ?? 'Все филиалы')
      }
    >
      <MapPin className="size-4" aria-hidden />
    </Button>
  ) : null;

  const toolbar = (
    <AnalyticsPeriodToolbar
      period={draftPeriod}
      periodLabel={periodLabel}
      periodError={periodError}
      onPresetChange={handlePresetChange}
      onCustomFromChange={(value) => {
        setDraftPeriod((current) => ({ ...current, customFrom: value }));
        setPeriodError(null);
      }}
      onCustomToChange={(value) => {
        setDraftPeriod((current) => ({ ...current, customTo: value }));
        setPeriodError(null);
      }}
      onApplyCustom={() => applyPeriod(draftPeriod)}
      branchPicker={branchPicker}
    />
  );

  const mobileBottomTabs = useMemo(
    () => (
      <DoctorMobileSectionTabs
        tabs={ANALYTICS_TABS}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        ariaLabel="Разделы аналитики"
      />
    ),
    [activeTab, handleTabChange],
  );

  return (
    <DoctorAppShell title="Аналитика" layout="full-height" mobileBottomTabs={mobileBottomTabs}>
      <DoctorPageHeader
        id="doctor-analytics-header"
        title="Аналитика"
        tabs={<AnalyticsTabsNav activeTab={activeTab} onTabClick={handleTabChange} />}
        toolbar={toolbar}
      />
      {mountedTabs.has('records') ? (
        <div
          hidden={activeTab !== 'records'}
          className={cn(
            DOCTOR_REMAINING_HEIGHT_BODY_CLASS,
            DOCTOR_DESKTOP_ATTACH_TO_PAGE_HEADER_CLASS,
          )}
          data-testid="tab-panel-records"
        >
          <RecordsTab
            patientGenPlural={patientGenPlural}
            period={appliedPeriod}
            periodReady={periodReady}
            locationFilter={locationFilter}
          />
        </div>
      ) : null}
      {mountedTabs.has('activity') ? (
        <div
          hidden={activeTab !== 'activity'}
          className={cn(
            DOCTOR_REMAINING_HEIGHT_BODY_CLASS,
            DOCTOR_DESKTOP_ATTACH_TO_PAGE_HEADER_CLASS,
          )}
          data-testid="tab-panel-activity"
        >
          <ActivityTab period={appliedPeriod} periodReady={periodReady} />
        </div>
      ) : null}
      {mountedTabs.has('finance') ? (
        <div
          hidden={activeTab !== 'finance'}
          className={cn(
            DOCTOR_REMAINING_HEIGHT_BODY_CLASS,
            DOCTOR_DESKTOP_ATTACH_TO_PAGE_HEADER_CLASS,
          )}
          data-testid="tab-panel-finance"
        >
          <FinanceTab
            period={appliedPeriod}
            periodReady={periodReady}
            locationFilter={locationFilter}
          />
        </div>
      ) : null}
      {mountedTabs.has('materials') ? (
        <div
          hidden={activeTab !== 'materials'}
          className={cn(
            DOCTOR_REMAINING_HEIGHT_BODY_CLASS,
            DOCTOR_DESKTOP_ATTACH_TO_PAGE_HEADER_CLASS,
          )}
          data-testid="tab-panel-materials"
        >
          <MaterialsTab />
        </div>
      ) : null}

      <DoctorModal
        open={branchPickerOpen}
        onClose={() => setBranchPickerOpen(false)}
        title="Филиал"
        size="sm"
        bodyClassName="p-0"
      >
        <div className="py-1" role="group" aria-label="Фильтр по филиалу">
          <Button
            type="button"
            variant="ghost"
            className={cn(
              'h-11 w-full justify-between rounded-none px-4 font-normal',
              !locationFilter && 'bg-primary/10 font-medium text-primary',
            )}
            onClick={() => {
              setLocationFilter(null);
              setBranchPickerOpen(false);
            }}
          >
            <span>Все филиалы</span>
            {!locationFilter ? <Check className="size-4" aria-hidden /> : null}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full justify-between rounded-none px-4 font-normal"
            onClick={() => {
              setLocationFilter('online');
              setBranchPickerOpen(false);
            }}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full bg-primary" aria-hidden />
              <span>Онлайн</span>
            </span>
            {locationFilter === 'online' ? (
              <Check className="size-4 text-primary" aria-hidden />
            ) : null}
          </Button>
          {branches.map((branch) => (
            <Button
              key={branch.id}
              type="button"
              variant="ghost"
              className="h-11 w-full justify-between rounded-none px-4 font-normal"
              onClick={() => {
                setLocationFilter(branch.id);
                setBranchPickerOpen(false);
              }}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: branch.color ?? '#5D98ED' }}
                  aria-hidden
                />
                <span className="truncate">{branch.shortTitle ?? branch.title}</span>
              </span>
              {branch.id === locationFilter ? (
                <Check className="size-4 text-primary" aria-hidden />
              ) : null}
            </Button>
          ))}
        </div>
      </DoctorModal>
    </DoctorAppShell>
  );
}
