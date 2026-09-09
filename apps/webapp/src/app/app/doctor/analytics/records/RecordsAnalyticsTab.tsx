'use client';

import { useCallback, useEffect, useState } from 'react';

import type { AppointmentDayPoint, ScheduleKpis } from '@/modules/doctor-appointments/ports';
import type { DoctorAnalyticsMetricKey } from '@/modules/doctor-analytics-metric-accounts/ports';
import { DoctorMetricList } from '@/shared/ui/doctor/DoctorMetricList';
import { DoctorSection, DoctorSectionTitle } from '@/shared/ui/doctor/DoctorSection';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';
import { MetricAccountsDialog } from '@/shared/ui/doctor/analytics/MetricAccountsDialog';

import { DoctorStatCard } from '../clients/DoctorStatCard';
import { AppointmentsDynamicsChart } from '../clients/AppointmentsDynamicsChart';
import {
  analyticsApiErrorMessage,
  buildAdminStatsQuery,
  type AnalyticsPeriodValue,
} from '../clients/analyticsPeriodUi';

type Props = {
  patientGenPlural?: string;
  period: AnalyticsPeriodValue;
  periodReady: boolean;
  locationFilter: string | null;
};

type ApiResponse = {
  ok?: boolean;
  error?: string;
  kpis?: ScheduleKpis;
  daySeries?: AppointmentDayPoint[];
};

type RecordsMetricView =
  | 'all'
  | 'past'
  | 'future'
  | 'unique'
  | 'first'
  | 'repeat'
  | 'cancelled'
  | 'rescheduled'
  | 'subscription';

export function RecordsAnalyticsTab({
  patientGenPlural = 'пациентов',
  period,
  periodReady,
  locationFilter,
}: Props) {
  const [kpis, setKpis] = useState<ScheduleKpis | null>(null);
  const [daySeries, setDaySeries] = useState<AppointmentDayPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [metricDialogOpen, setMetricDialogOpen] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<DoctorAnalyticsMetricKey | null>(null);
  const [selectedMetricTitle, setSelectedMetricTitle] = useState('');
  const [selectedView, setSelectedView] = useState<RecordsMetricView>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams(buildAdminStatsQuery(period));
      if (locationFilter === 'online') q.set('location', 'online');
      else if (locationFilter) q.set('branchId', locationFilter);
      const res = await fetch(`/api/doctor/analytics/records?${q}`, { cache: 'no-store' });
      const json = (await res.json()) as ApiResponse;
      if (!res.ok || !json.ok || !json.kpis) {
        setKpis(null);
        setDaySeries([]);
        setError(analyticsApiErrorMessage(json.error, res.status));
        return;
      }
      setKpis(json.kpis);
      setDaySeries(json.daySeries ?? []);
    } catch {
      setKpis(null);
      setDaySeries([]);
      setError('Не удалось загрузить аналитику.');
    } finally {
      setLoading(false);
    }
  }, [locationFilter, period]);

  useEffect(() => {
    if (!periodReady) return;
    void load();
  }, [load, periodReady]);

  const openMetric = useCallback(
    (metric: DoctorAnalyticsMetricKey, title: string, view: RecordsMetricView) => {
      setSelectedMetric(metric);
      setSelectedMetricTitle(title);
      setSelectedView(view);
      setMetricDialogOpen(true);
    },
    [],
  );

  return (
    <div className="flex min-h-0 min-w-0 w-full max-w-6xl flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto py-3">
      <DoctorSection id="doctor-analytics-records-section" className="min-w-0 overflow-hidden">
        <DoctorSectionTitle>Записи</DoctorSectionTitle>

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        {loading && !kpis ? <DoctorPanelLoading className="py-6" /> : null}

        {kpis ? (
          <>
            {daySeries.length > 1 ? (
              <div className="mb-4 min-w-0 overflow-hidden">
                <AppointmentsDynamicsChart series={daySeries} />
              </div>
            ) : null}

            <DoctorMetricList id="doctor-analytics-records-cards" columns="analytics">
              <DoctorStatCard
                id="doctor-analytics-records-total"
                title="Всего записей"
                value={kpis.recordsInPeriod}
                onClick={() => openMetric('analytics_records_period', 'Записи за период', 'all')}
              />
              <DoctorStatCard
                id="doctor-analytics-records-past"
                title="Состоявшиеся"
                value={kpis.pastInPeriod}
                onClick={() =>
                  openMetric('analytics_records_period', 'Состоявшиеся записи', 'past')
                }
              />
              <DoctorStatCard
                id="doctor-analytics-records-future"
                title="Будущие"
                value={kpis.futureInPeriod}
                onClick={() => openMetric('analytics_records_period', 'Будущие записи', 'future')}
              />
              <DoctorStatCard
                id="doctor-analytics-records-unique"
                title={`Уникальных ${patientGenPlural}`}
                value={kpis.uniquePatientsInPeriod}
                onClick={() =>
                  openMetric('analytics_records_period', `Уникальные ${patientGenPlural}`, 'unique')
                }
              />
              <DoctorStatCard
                id="doctor-analytics-records-first"
                title="Первичных"
                value={kpis.firstVisitInPeriod}
                onClick={() => openMetric('analytics_records_period', 'Первичные записи', 'first')}
              />
              <DoctorStatCard
                id="doctor-analytics-records-repeat"
                title="Повторных"
                value={kpis.repeatVisitInPeriod}
                onClick={() => openMetric('analytics_records_period', 'Повторные записи', 'repeat')}
              />
              <DoctorStatCard
                id="doctor-analytics-records-cancellations"
                title="Отмены"
                value={kpis.cancellationsInPeriod}
                tone="warning"
                valueClassName="text-destructive"
                onClick={() =>
                  openMetric(
                    'analytics_records_cancelled',
                    'Отменённые записи за период',
                    'cancelled',
                  )
                }
              />
              <DoctorStatCard
                id="doctor-analytics-records-reschedules"
                title="Переносы"
                value={kpis.reschedulesInPeriod}
                onClick={() =>
                  openMetric('analytics_records_period', 'Перенесённые записи', 'rescheduled')
                }
              />
              <DoctorStatCard
                id="doctor-analytics-records-by-subscription"
                title="По абонементу"
                value={kpis.bySubscriptionInPeriod}
                onClick={() =>
                  openMetric('analytics_records_period', 'Записи по абонементу', 'subscription')
                }
              />
            </DoctorMetricList>
          </>
        ) : null}
      </DoctorSection>

      <MetricAccountsDialog
        open={metricDialogOpen}
        onOpenChange={setMetricDialogOpen}
        metric={selectedMetric}
        title={selectedMetricTitle}
        period={period}
        apiPath="/api/doctor/analytics/records/drilldown"
        extraQuery={{
          view: selectedView,
          ...(locationFilter === 'online'
            ? { location: 'online' }
            : locationFilter
              ? { branchId: locationFilter }
              : {}),
        }}
        tone={selectedView === 'cancelled' ? 'destructive' : 'neutral'}
      />
    </div>
  );
}
