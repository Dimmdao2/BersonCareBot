'use client';

import { useCallback, useEffect, useState } from 'react';

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

import { DoctorStatCard } from '../clients/DoctorStatCard';
import {
  analyticsApiErrorMessage,
  buildAdminStatsQuery,
  type AnalyticsPeriodValue,
} from '../clients/analyticsPeriodUi';
import { ProgramActivityDynamicsChart } from './ProgramActivityDynamicsChart';

type Props = {
  period: AnalyticsPeriodValue;
  periodReady: boolean;
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

export function ActivityAnalyticsTab({ period, periodReady }: Props) {
  const { patientGenPlural } = useDoctorPatientTerms();
  const [kpis, setKpis] = useState<DoctorProgramActivityKpis | null>(null);
  const [daySeries, setDaySeries] = useState<ProgramActivityDayPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [metricDialogOpen, setMetricDialogOpen] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<DoctorAnalyticsMetricKey | null>(null);
  const [selectedMetricTitle, setSelectedMetricTitle] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = buildAdminStatsQuery(period);
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
  }, [period]);

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
    <div className="flex min-h-0 min-w-0 w-full max-w-6xl flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto py-3">
      <DoctorSection id="doctor-analytics-activity-section" className="min-w-0 overflow-hidden">
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
            {daySeries.length > 1 ? (
              <div className="mb-4 min-w-0 overflow-hidden">
                <ProgramActivityDynamicsChart series={daySeries} />
              </div>
            ) : null}

            <DoctorMetricList id="doctor-analytics-activity-cards" columns="analytics">
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
          </>
        ) : null}
      </DoctorSection>

      <MetricAccountsDialog
        open={metricDialogOpen}
        onOpenChange={setMetricDialogOpen}
        metric={selectedMetric}
        title={selectedMetricTitle}
        period={period}
        apiPath="/api/doctor/analytics/activity/drilldown"
      />
    </div>
  );
}
