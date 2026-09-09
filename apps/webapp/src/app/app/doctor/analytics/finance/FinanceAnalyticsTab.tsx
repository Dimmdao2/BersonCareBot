'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShoppingBag } from 'lucide-react';

import type {
  DoctorFinanceAnalytics,
  FinanceAnalyticsBucket,
} from '@/modules/doctor-finance-analytics/ports';
import { cn } from '@/lib/utils';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { DoctorMetricList } from '@/shared/ui/doctor/DoctorMetricList';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';
import { DoctorSection, DoctorSectionTitle } from '@/shared/ui/doctor/DoctorSection';
import { DoctorEmptyState } from '@/shared/ui/doctor/DoctorEmptyState';
import { DoctorSoldMembershipsModal } from '@/shared/ui/doctor/DoctorSoldMembershipsModal';

import { DoctorStatCard } from '../clients/DoctorStatCard';
import {
  analyticsApiErrorMessage,
  buildAdminStatsQuery,
  type AnalyticsPeriodValue,
} from '../clients/analyticsPeriodUi';
import { FinanceDynamicsChart } from './FinanceDynamicsChart';

type Props = {
  period: AnalyticsPeriodValue;
  periodReady: boolean;
  locationFilter: string | null;
};

type ApiResponse = {
  ok?: boolean;
  error?: string;
  analytics?: DoctorFinanceAnalytics;
};

function formatMoney(amountMinor: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

export function FinanceAnalyticsTab({ period, periodReady, locationFilter }: Props) {
  const [bucket, setBucket] = useState<FinanceAnalyticsBucket>('week');
  const [analytics, setAnalytics] = useState<DoctorFinanceAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [soldMembershipsOpen, setSoldMembershipsOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams(buildAdminStatsQuery(period));
      query.set('bucket', bucket);
      if (locationFilter === 'online') query.set('location', 'online');
      else if (locationFilter) query.set('branchId', locationFilter);
      const response = await fetch(`/api/doctor/analytics/finance?${query}`, {
        cache: 'no-store',
      });
      const json = (await response.json()) as ApiResponse;
      if (!response.ok || !json.ok || !json.analytics) {
        setAnalytics(null);
        setError(analyticsApiErrorMessage(json.error, response.status));
        return;
      }
      setAnalytics(json.analytics);
    } catch {
      setAnalytics(null);
      setError('Не удалось загрузить финансовую аналитику.');
    } finally {
      setLoading(false);
    }
  }, [bucket, locationFilter, period]);

  useEffect(() => {
    if (periodReady) void load();
  }, [load, periodReady]);

  return (
    <div className="flex min-h-0 min-w-0 w-full max-w-6xl flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto py-3">
      <DoctorSection id="doctor-analytics-finance-section" className="min-w-0 overflow-hidden">
        <DoctorSectionTitle>Финансы</DoctorSectionTitle>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {loading && !analytics ? <DoctorPanelLoading className="py-6" /> : null}

        {analytics ? (
          <>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-sm font-medium text-foreground">Динамика поступлений</h3>
              <div className="grid grid-cols-2 rounded-lg border border-border bg-muted/30 p-0.5">
                {(['week', 'month'] as const).map((value) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-pressed={bucket === value}
                    onClick={() => setBucket(value)}
                    className={cn(
                      'h-7 rounded-md px-2 text-xs',
                      bucket === value &&
                        'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
                    )}
                  >
                    {value === 'week' ? 'Недели' : 'Месяцы'}
                  </Button>
                ))}
              </div>
            </div>
            {analytics.series.length > 0 ? (
              <div className="min-w-0 overflow-hidden">
                <FinanceDynamicsChart series={analytics.series} />
              </div>
            ) : (
              <DoctorEmptyState>За выбранный период поступлений нет</DoctorEmptyState>
            )}

            <DoctorMetricList columns="analytics" id="doctor-analytics-finance-cards">
              <DoctorStatCard
                id="doctor-analytics-finance-total"
                title="Поступило"
                value={formatMoney(analytics.totalMinor)}
              />
              <DoctorStatCard
                id="doctor-analytics-finance-memberships"
                title="С абонементов"
                value={formatMoney(analytics.membershipMinor)}
              />
              <DoctorStatCard
                id="doctor-analytics-finance-online"
                title="Онлайн"
                value={formatMoney(analytics.onlineMinor)}
              />
              <DoctorStatCard
                id="doctor-analytics-finance-cash"
                title="Наличными"
                value={formatMoney(analytics.cashMinor)}
              />
            </DoctorMetricList>

            <div className="mt-4 flex justify-end">
              <Button type="button" variant="outline" onClick={() => setSoldMembershipsOpen(true)}>
                <ShoppingBag className="size-4" aria-hidden />
                Проданные абонементы
              </Button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Breakdown title="По услугам" rows={analytics.byService} />
              <Breakdown title="По филиалам" rows={analytics.byBranch} />
            </div>
          </>
        ) : null}
      </DoctorSection>
      <DoctorSoldMembershipsModal
        open={soldMembershipsOpen}
        onOpenChange={setSoldMembershipsOpen}
      />
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: DoctorFinanceAnalytics['byService'] }) {
  return (
    <div className="min-w-0">
      <h3 className="mb-1.5 text-sm font-medium text-muted-foreground">{title}</h3>
      {rows.length > 0 ? (
        <div className="divide-y divide-border/60 rounded-lg border border-border/60">
          {rows.map((row) => (
            <div
              key={row.key}
              className="flex min-w-0 items-center justify-between gap-3 px-3 py-2"
            >
              <span className="truncate text-sm text-foreground">{row.label}</span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                {formatMoney(row.amountMinor)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <DoctorEmptyState size="xs">Нет данных</DoctorEmptyState>
      )}
    </div>
  );
}
