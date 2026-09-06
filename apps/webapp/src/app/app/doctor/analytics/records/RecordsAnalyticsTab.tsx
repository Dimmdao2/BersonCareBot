'use client';

import { DateTime } from 'luxon';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AdminStatsTimePreset } from '@/modules/admin-platform-stats/types';
import type { AppointmentBranchPoint, AppointmentDayPoint, ScheduleKpis } from '@/modules/doctor-appointments/ports';
import type { DoctorAnalyticsMetricKey } from '@/modules/doctor-analytics-metric-accounts/ports';
import { DoctorMetricList } from '@/shared/ui/doctor/DoctorMetricList';
import { DoctorSection, DoctorSectionTitle } from '@/shared/ui/doctor/DoctorSection';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';
import { MetricAccountsDialog } from '@/shared/ui/doctor/analytics/MetricAccountsDialog';

import { AnalyticsPeriodToolbar } from '../clients/AnalyticsPeriodToolbar';
import { DoctorStatCard } from '../clients/DoctorStatCard';
import { AppointmentsDynamicsChart } from '../clients/AppointmentsDynamicsChart';
import {
  analyticsApiErrorMessage,
  buildAdminStatsQuery,
  resolveAnalyticsPeriodLabel,
  validateCustomAnalyticsPeriod,
  ymdMinusDays,
  type AnalyticsPeriodValue,
} from '../clients/analyticsPeriodUi';

type Props = {
  calendarTodayYmd: string;
  displayIana: string;
  patientGenPlural?: string;
};

type ApiResponse = {
  ok?: boolean;
  error?: string;
  kpis?: ScheduleKpis;
  daySeries?: AppointmentDayPoint[];
  branchSeries?: AppointmentBranchPoint[];
};

export function RecordsAnalyticsTab({
  calendarTodayYmd,
  displayIana,
  patientGenPlural = 'пациентов',
}: Props) {
  const [preset, setPreset] = useState<AdminStatsTimePreset>('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [appliedPeriod, setAppliedPeriod] = useState<AnalyticsPeriodValue>({
    preset: 'week',
    customFrom: '',
    customTo: '',
  });
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [periodReady, setPeriodReady] = useState(true);

  const [kpis, setKpis] = useState<ScheduleKpis | null>(null);
  const [daySeries, setDaySeries] = useState<AppointmentDayPoint[]>([]);
  const [branchSeries, setBranchSeries] = useState<AppointmentBranchPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [metricDialogOpen, setMetricDialogOpen] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<DoctorAnalyticsMetricKey | null>(null);
  const [selectedMetricTitle, setSelectedMetricTitle] = useState('');
  const [selectedOnlyCancelled, setSelectedOnlyCancelled] = useState(false);

  const period = useMemo<AnalyticsPeriodValue>(
    () => ({ preset, customFrom, customTo }),
    [preset, customFrom, customTo],
  );
  const periodLabel = useMemo(
    () => resolveAnalyticsPeriodLabel(displayIana, appliedPeriod),
    [displayIana, appliedPeriod],
  );

  const applyPeriod = useCallback((next: AnalyticsPeriodValue) => {
    const err = validateCustomAnalyticsPeriod(next);
    if (err) {
      setPeriodError(err);
      setPeriodReady(false);
      return;
    }
    setPeriodError(null);
    setPeriodReady(true);
    setAppliedPeriod(next);
  }, []);

  const handlePresetChange = useCallback(
    (next: AdminStatsTimePreset) => {
      setPreset(next);
      if (next === 'custom') {
        const t = calendarTodayYmd.trim() || DateTime.now().setZone(displayIana).toISODate() || '';
        const from = ymdMinusDays(t, 6);
        setCustomFrom(from);
        setCustomTo(t);
        applyPeriod({ preset: 'custom', customFrom: from, customTo: t });
        return;
      }
      setCustomFrom('');
      setCustomTo('');
      applyPeriod({ preset: next, customFrom: '', customTo: '' });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- displayIana стабилен в рамках сессии
    [applyPeriod, calendarTodayYmd],
  );

  const handleApplyCustom = useCallback(() => applyPeriod(period), [applyPeriod, period]);
  const handleCustomFromChange = useCallback((value: string) => {
    setCustomFrom(value);
    setPeriodError(null);
  }, []);
  const handleCustomToChange = useCallback((value: string) => {
    setCustomTo(value);
    setPeriodError(null);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = buildAdminStatsQuery(appliedPeriod);
      const res = await fetch(`/api/doctor/analytics/records?${q}`, { cache: 'no-store' });
      const json = (await res.json()) as ApiResponse;
      if (!res.ok || !json.ok || !json.kpis) {
        setKpis(null);
        setDaySeries([]);
        setBranchSeries([]);
        setError(analyticsApiErrorMessage(json.error, res.status));
        return;
      }
      setKpis(json.kpis);
      setDaySeries(json.daySeries ?? []);
      setBranchSeries(json.branchSeries ?? []);
    } catch {
      setKpis(null);
      setDaySeries([]);
      setBranchSeries([]);
      setError('Не удалось загрузить аналитику.');
    } finally {
      setLoading(false);
    }
  }, [appliedPeriod]);

  useEffect(() => {
    if (!periodReady) return;
    void load();
  }, [load, periodReady]);

  const openMetric = useCallback(
    (metric: DoctorAnalyticsMetricKey, title: string, onlyCancelled: boolean) => {
      setSelectedMetric(metric);
      setSelectedMetricTitle(title);
      setSelectedOnlyCancelled(onlyCancelled);
      setMetricDialogOpen(true);
    },
    [],
  );

  return (
    <div className="flex flex-col gap-3 max-w-6xl">
      <AnalyticsPeriodToolbar
        period={period}
        periodLabel={periodLabel}
        periodError={periodError}
        onPresetChange={handlePresetChange}
        onCustomFromChange={handleCustomFromChange}
        onCustomToChange={handleCustomToChange}
        onApplyCustom={handleApplyCustom}
      />

      <DoctorSection id="doctor-analytics-records-section">
        <DoctorSectionTitle>Записи</DoctorSectionTitle>

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        {loading && !kpis ? <DoctorPanelLoading className="py-6" /> : null}

        {kpis ? (
          <>
            <DoctorMetricList id="doctor-analytics-records-cards">
              <DoctorStatCard
                id="doctor-analytics-records-total"
                title="Всего записей"
                value={kpis.recordsInPeriod}
                onClick={() => openMetric('analytics_records_period', 'Записи за период', false)}
              />
              <DoctorStatCard
                id="doctor-analytics-records-past"
                title="Состоявшиеся"
                value={kpis.pastInPeriod}
              />
              <DoctorStatCard
                id="doctor-analytics-records-future"
                title="Будущие"
                value={kpis.futureInPeriod}
              />
              <DoctorStatCard
                id="doctor-analytics-records-unique"
                title={`Уникальных ${patientGenPlural}`}
                value={kpis.uniquePatientsInPeriod}
              />
              <DoctorStatCard
                id="doctor-analytics-records-first"
                title="Первичных"
                value={kpis.firstVisitInPeriod}
              />
              <DoctorStatCard
                id="doctor-analytics-records-repeat"
                title="Повторных"
                value={kpis.repeatVisitInPeriod}
              />
              <DoctorStatCard
                id="doctor-analytics-records-cancellations"
                title="Отмены"
                value={kpis.cancellationsInPeriod}
                tone="warning"
                onClick={() =>
                  openMetric('analytics_records_cancelled', 'Отменённые записи за период', true)
                }
              />
              <DoctorStatCard
                id="doctor-analytics-records-reschedules"
                title="Переносы"
                value={kpis.reschedulesInPeriod}
              />
              <DoctorStatCard
                id="doctor-analytics-records-by-subscription"
                title="По абонементу"
                value={kpis.bySubscriptionInPeriod}
              />
            </DoctorMetricList>

            {daySeries.length > 1 ? (
              <div className="mt-4">
                <AppointmentsDynamicsChart series={daySeries} />
              </div>
            ) : null}

            {branchSeries.length > 1 ? (
              <div className="mt-4 max-w-3xl">
                <h4 className="text-sm font-medium text-muted-foreground mb-2">По филиалам</h4>
                <DoctorMetricList id="doctor-analytics-records-branches">
                  {branchSeries.map((b) => (
                    <DoctorStatCard
                      key={b.branchName}
                      id={`doctor-analytics-records-branch-${b.branchName}`}
                      title={b.branchName}
                      value={b.pastVisits}
                      hint={`Отменено: ${b.cancelledVisits}`}
                    />
                  ))}
                </DoctorMetricList>
              </div>
            ) : null}
          </>
        ) : null}
      </DoctorSection>

      <MetricAccountsDialog
        open={metricDialogOpen}
        onOpenChange={setMetricDialogOpen}
        metric={selectedMetric}
        title={selectedMetricTitle}
        period={appliedPeriod}
        apiPath="/api/doctor/analytics/records/drilldown"
        extraQuery={selectedOnlyCancelled ? { onlyCancelled: '1' } : undefined}
      />
    </div>
  );
}
