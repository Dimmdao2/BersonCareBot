'use client';

import Link from 'next/link';
import { DateTime } from 'luxon';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AdminStatsTimePreset } from '@/modules/admin-platform-stats/types';
import type {
  DoctorProgramActivityKpis,
  ProgramActivityDayPoint,
} from '@/modules/doctor-program-activity/ports';
import type { DoctorAnalyticsMetricKey } from '@/modules/doctor-analytics-metric-accounts/ports';
import { DoctorMetricList } from '@/shared/ui/doctor/DoctorMetricList';
import { DoctorSection, DoctorSectionTitle } from '@/shared/ui/doctor/DoctorSection';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';
import { MetricAccountsDialog } from '@/shared/ui/doctor/analytics/MetricAccountsDialog';
import { useDoctorPatientTerms } from '@/shared/ui/doctor/shell/DoctorPatientTermsContext';

import { AnalyticsPeriodToolbar } from '../clients/AnalyticsPeriodToolbar';
import { DoctorStatCard } from '../clients/DoctorStatCard';
import {
  analyticsApiErrorMessage,
  buildAdminStatsQuery,
  resolveAnalyticsPeriodLabel,
  validateCustomAnalyticsPeriod,
  ymdMinusDays,
  type AnalyticsPeriodValue,
} from '../clients/analyticsPeriodUi';
import { ProgramActivityDynamicsChart } from './ProgramActivityDynamicsChart';

type Props = {
  calendarTodayYmd: string;
  displayIana: string;
};

type ApiResponse = {
  ok?: boolean;
  error?: string;
  kpis?: DoctorProgramActivityKpis;
  daySeries?: ProgramActivityDayPoint[];
};

function formatShare(share: number): string {
  return `${Math.round(share * 100)}%`;
}

export function ActivityAnalyticsTab({ calendarTodayYmd, displayIana }: Props) {
  const { patientGenPlural } = useDoctorPatientTerms();
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

  const [kpis, setKpis] = useState<DoctorProgramActivityKpis | null>(null);
  const [daySeries, setDaySeries] = useState<ProgramActivityDayPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [metricDialogOpen, setMetricDialogOpen] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<DoctorAnalyticsMetricKey | null>(null);
  const [selectedMetricTitle, setSelectedMetricTitle] = useState('');

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
      const res = await fetch(`/api/doctor/analytics/activity?${q}`, { cache: 'no-store' });
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
  }, [appliedPeriod]);

  useEffect(() => {
    if (!periodReady) return;
    void load();
  }, [load, periodReady]);

  const openActivityDrilldown = useCallback(() => {
    setSelectedMetric('analytics_activity_patients');
    setSelectedMetricTitle(`${patientGenPlural} с активностью за период`);
    setMetricDialogOpen(true);
  }, [patientGenPlural]);

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

      <DoctorSection id="doctor-analytics-activity-section">
        <DoctorSectionTitle>Активность</DoctorSectionTitle>
        <p className="text-muted-foreground text-sm">
          Фактические отметки выполнения по назначенным программам — не процент соблюдения
          расписания.
        </p>

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        {loading && !kpis ? <DoctorPanelLoading className="py-6" /> : null}

        {kpis ? (
          <>
            <DoctorMetricList id="doctor-analytics-activity-cards">
              <DoctorStatCard
                id="doctor-analytics-activity-with-program"
                title={`${patientGenPlural} с программой`}
                value={kpis.patientsWithActiveProgram}
              />
              <DoctorStatCard
                id="doctor-analytics-activity-with-activity"
                title="С активностью за период"
                value={kpis.patientsWithActivityInPeriod}
                onClick={openActivityDrilldown}
              />
              <DoctorStatCard
                id="doctor-analytics-activity-done-count"
                title="Отметок за период"
                value={kpis.doneCountInPeriod}
              />
              <DoctorStatCard
                id="doctor-analytics-activity-days"
                title="Дней с активностью"
                value={kpis.daysWithActivityInPeriod}
              />
              <DoctorStatCard
                id="doctor-analytics-activity-share"
                title="Доля активных"
                value={formatShare(kpis.activePatientShare)}
                hint={`от ${patientGenPlural} с программой`}
              />
            </DoctorMetricList>

            {daySeries.length > 1 ? (
              <div className="mt-4">
                <ProgramActivityDynamicsChart series={daySeries} />
              </div>
            ) : null}
          </>
        ) : null}

        <p className="text-sm">
          <Link
            href="/app/doctor/material-ratings"
            className="text-primary underline-offset-2 hover:underline"
          >
            Оценки материалов →
          </Link>
        </p>
      </DoctorSection>

      <MetricAccountsDialog
        open={metricDialogOpen}
        onOpenChange={setMetricDialogOpen}
        metric={selectedMetric}
        title={selectedMetricTitle}
        period={appliedPeriod}
        apiPath="/api/doctor/analytics/activity/drilldown"
      />
    </div>
  );
}
