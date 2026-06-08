"use client";

import { useCallback, useState } from "react";
import type { DoctorStatsState } from "@/modules/doctor-stats/service";
import type { DoctorAnalyticsMetricKey } from "@/modules/doctor-analytics-metric-accounts/ports";
import { DoctorMetricList } from "@/shared/ui/doctor/DoctorMetricList";
import { DoctorStatCard } from "./analytics/clients/DoctorStatCard";
import { MetricAccountsDialog } from "./analytics/clients/MetricAccountsDialog";

type Props = {
  kpiStats: DoctorStatsState;
  appointmentsTodayCount: number;
  unreadMessagesCount: number;
};

type MetricDialogState = {
  metric: DoctorAnalyticsMetricKey;
  title: string;
} | null;

export function DoctorTodayKpiSection({ kpiStats, appointmentsTodayCount, unreadMessagesCount }: Props) {
  const [dialog, setDialog] = useState<MetricDialogState>(null);

  const openMetric = useCallback((metric: DoctorAnalyticsMetricKey, title: string) => {
    setDialog({ metric, title });
  }, []);

  return (
    <>
      <DoctorMetricList id="doctor-today-kpi" aria-label="Показатели">
        <DoctorStatCard
          id="doctor-today-kpi-unread-messages"
          title="Новые сообщения"
          value={unreadMessagesCount}
          tone={unreadMessagesCount > 0 ? "warning" : "neutral"}
          href="/app/doctor/messages"
        />
        <DoctorStatCard
          id="doctor-today-kpi-appointments-today"
          title="Записи сегодня"
          value={appointmentsTodayCount}
          onClick={() => openMetric("today_appointments_today", "Записи сегодня")}
        />
        <DoctorStatCard
          id="doctor-today-kpi-appointments-week"
          title="Записи на неделю"
          value={kpiStats.appointments.total}
          onClick={() => openMetric("today_appointments_week", "Записи на неделю")}
        />
        <DoctorStatCard
          id="doctor-today-kpi-cancellations-30d"
          title="Отмены за 30 дн."
          value={kpiStats.appointments.cancellations30d}
          tone="warning"
          onClick={() => openMetric("today_cancellations_30d", "Отмены за 30 дн.")}
        />
      </DoctorMetricList>

      <MetricAccountsDialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        metric={dialog?.metric ?? null}
        title={dialog?.title ?? ""}
        apiPath="/api/doctor/analytics-metric-accounts"
      />
    </>
  );
}
