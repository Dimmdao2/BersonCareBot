"use client";

import { useCallback, useEffect, useState } from "react";

import type { AppointmentBranchPoint, AppointmentDayPoint, AppointmentStats } from "@/modules/doctor-appointments/ports";
import type { DoctorAnalyticsMetricKey } from "@/modules/doctor-analytics-metric-accounts/ports";
import { DoctorMetricList } from "@/shared/ui/doctor/DoctorMetricList";
import { DoctorSection, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";

import { buildAdminStatsQuery, type AnalyticsPeriodValue } from "./analyticsPeriodUi";
import { AppointmentsDynamicsChart } from "./AppointmentsDynamicsChart";
import { DoctorStatCard } from "./DoctorStatCard";

type Props = {
  period: AnalyticsPeriodValue;
  ready: boolean;
  onMetricClick?: (metric: DoctorAnalyticsMetricKey, title: string) => void;
};

type ApiResponse = {
  ok?: boolean;
  error?: string;
  appointments?: AppointmentStats;
  daySeries?: AppointmentDayPoint[];
  branchSeries?: AppointmentBranchPoint[];
};

export function DoctorAnalyticsAppointmentsSection({ period, ready, onMetricClick }: Props) {
  const [stats, setStats] = useState<AppointmentStats | null>(null);
  const [daySeries, setDaySeries] = useState<AppointmentDayPoint[]>([]);
  const [branchSeries, setBranchSeries] = useState<AppointmentBranchPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = buildAdminStatsQuery(period);
      const res = await fetch(`/api/admin/doctor-analytics-appointments?${q}`, { cache: "no-store" });
      const json = (await res.json()) as ApiResponse;
      if (!res.ok || !json.ok || !json.appointments) {
        setStats(null);
        setDaySeries([]);
        setBranchSeries([]);
        setError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      setStats(json.appointments);
      setDaySeries(json.daySeries ?? []);
      setBranchSeries(json.branchSeries ?? []);
    } catch {
      setStats(null);
      setDaySeries([]);
      setBranchSeries([]);
      setError("network");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [load, ready]);

  return (
    <DoctorSection id="doctor-stats-appointments-section">
      <DoctorSectionTitle>Приём</DoctorSectionTitle>
      <p className="text-muted-foreground text-sm">
        Визиты — прошедшие слоты без отмены; «записались» — по дате создания записи; отмены и переносы — по факту
        действия в выбранном периоде.
      </p>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {loading && !stats ? (
        <p className="text-muted-foreground text-sm" aria-busy="true">
          Загрузка…
        </p>
      ) : null}

      {stats ? (
        <>
          <DoctorMetricList id="doctor-stats-appointments-cards">
            <DoctorStatCard
              id="doctor-stats-appointments-past-visits"
              title="Визиты клиентов"
              value={stats.pastVisitsInPeriod}
              onClick={
                onMetricClick ? () => onMetricClick("appointments_past_visits", "Визиты клиентов за период") : undefined
              }
            />
            <DoctorStatCard
              id="doctor-stats-appointments-cancelled-visits"
              title="Отменённых визитов"
              value={stats.cancelledVisitsInPeriod}
              tone="warning"
              onClick={
                onMetricClick
                  ? () => onMetricClick("appointments_cancelled_visits", "Отменённые визиты за период")
                  : undefined
              }
            />
            <DoctorStatCard
              id="doctor-stats-appointments-bookings-created"
              title="Записались за период"
              value={stats.bookingsCreatedInPeriod}
              onClick={
                onMetricClick
                  ? () => onMetricClick("appointments_bookings_created", "Записи, созданные за период")
                  : undefined
              }
            />
            <DoctorStatCard
              id="doctor-stats-appointments-cancellation-actions"
              title="Отмены записи"
              value={stats.cancellationActionsInPeriod}
              tone="warning"
              onClick={
                onMetricClick
                  ? () => onMetricClick("appointments_cancellation_actions", "Отмены записей за период")
                  : undefined
              }
            />
            <DoctorStatCard
              id="doctor-stats-appointments-reschedule-actions"
              title="Переносы за период"
              value={stats.rescheduleActionsInPeriod}
              onClick={
                onMetricClick
                  ? () => onMetricClick("appointments_reschedule_actions", "Переносы записей за период")
                  : undefined
              }
            />
          </DoctorMetricList>

          {daySeries.length > 1 ? (
            <div className="mt-4">
              <AppointmentsDynamicsChart series={daySeries} />
            </div>
          ) : null}

          {branchSeries.length > 1 ? (
            <div className="mt-4 flex flex-col gap-2">
              <h4 className="text-sm font-medium text-muted-foreground">По филиалам</h4>
              <DoctorMetricList id="doctor-stats-appointments-branches">
                {branchSeries.map((b) => (
                  <DoctorStatCard
                    key={b.branchName}
                    id={`doctor-stats-branch-${b.branchName}`}
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
  );
}
