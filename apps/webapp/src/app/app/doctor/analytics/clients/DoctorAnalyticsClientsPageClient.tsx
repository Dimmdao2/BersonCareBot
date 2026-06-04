"use client";

import { useCallback, useMemo, useState } from "react";

import type {
  ClientContactBreakdown,
  ClientContactPieSegment,
} from "@/modules/doctor-clients/clientContactSegments";
import type { AdminStatsTimePreset } from "@/modules/admin-platform-stats/types";
import type { DoctorAnalyticsMetricKey } from "@/modules/doctor-analytics-metric-accounts/ports";
import { DoctorMetricList } from "@/shared/ui/doctor/DoctorMetricList";
import { DoctorSection, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";

import { AdminPlatformRegistrationStatsClient } from "./AdminPlatformRegistrationStatsClient";
import { AdminPlatformSubscriberStatsClient } from "./AdminPlatformSubscriberStatsClient";
import { AnalyticsPeriodToolbar } from "./AnalyticsPeriodToolbar";
import { ClientContactPieChart } from "./ClientContactPieChart";
import { DoctorAnalyticsAppointmentsSection } from "./DoctorAnalyticsAppointmentsSection";
import { DoctorStatCard } from "./DoctorStatCard";
import { MetricAccountsDialog } from "./MetricAccountsDialog";
import {
  resolveAnalyticsPeriodLabel,
  validateCustomAnalyticsPeriod,
  ymdMinusDays,
  type AnalyticsPeriodValue,
} from "./analyticsPeriodUi";

type ClientsSnapshot = {
  total: number;
  phoneOnly: number;
  appGuests: number;
  contactBreakdown: ClientContactBreakdown;
};

type Props = {
  calendarTodayYmd: string;
  displayIana: string;
  clients: ClientsSnapshot;
};

export function DoctorAnalyticsClientsPageClient({ calendarTodayYmd, displayIana, clients }: Props) {
  const [preset, setPreset] = useState<AdminStatsTimePreset>("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [periodReady, setPeriodReady] = useState(true);
  const [metricDialogOpen, setMetricDialogOpen] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<DoctorAnalyticsMetricKey | null>(null);
  const [selectedMetricTitle, setSelectedMetricTitle] = useState("");

  const period = useMemo<AnalyticsPeriodValue>(
    () => ({ preset, customFrom, customTo }),
    [preset, customFrom, customTo],
  );

  const periodLabel = useMemo(
    () => resolveAnalyticsPeriodLabel(displayIana, period),
    [displayIana, period],
  );

  const applyPeriod = useCallback(
    (next: AnalyticsPeriodValue) => {
      const err = validateCustomAnalyticsPeriod(next);
      if (err) {
        setPeriodError(err);
        setPeriodReady(false);
        return;
      }
      setPeriodError(null);
      setPeriodReady(true);
    },
    [],
  );

  const handlePresetChange = useCallback(
    (next: AdminStatsTimePreset) => {
      setPreset(next);
      if (next === "custom") {
        const t = calendarTodayYmd.trim() || new Date().toISOString().slice(0, 10);
        const from = ymdMinusDays(t, 6);
        const to = t;
        setCustomFrom(from);
        setCustomTo(to);
        applyPeriod({ preset: "custom", customFrom: from, customTo: to });
        return;
      }
      setCustomFrom("");
      setCustomTo("");
      applyPeriod({ preset: next, customFrom: "", customTo: "" });
    },
    [applyPeriod, calendarTodayYmd],
  );

  const handleApplyCustom = useCallback(() => {
    applyPeriod(period);
  }, [applyPeriod, period]);

  const openMetric = useCallback((metric: DoctorAnalyticsMetricKey, title: string) => {
    setSelectedMetric(metric);
    setSelectedMetricTitle(title);
    setMetricDialogOpen(true);
  }, []);

  const openContactSegment = useCallback(
    (segment: ClientContactPieSegment, label: string) => {
      const map: Record<ClientContactPieSegment, DoctorAnalyticsMetricKey> = {
        telegram_only: "clients_segment_telegram_only",
        max_only: "clients_segment_max_only",
        email_only: "clients_segment_email_only",
        telegram_email: "clients_segment_telegram_email",
        max_email: "clients_segment_max_email",
        phone_email_no_messenger: "clients_segment_phone_email_no_messenger",
      };
      openMetric(map[segment], `Каналы связи: ${label}`);
    },
    [openMetric],
  );

  return (
    <div className="flex flex-col gap-3">
      <AnalyticsPeriodToolbar
        period={period}
        periodLabel={periodLabel}
        periodError={periodError}
        onPresetChange={handlePresetChange}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
        onApplyCustom={handleApplyCustom}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <AdminPlatformSubscriberStatsClient period={period} ready={periodReady} onMetricClick={openMetric} />
        <AdminPlatformRegistrationStatsClient period={period} ready={periodReady} onMetricClick={openMetric} />
      </div>

      <DoctorAnalyticsAppointmentsSection period={period} ready={periodReady} onMetricClick={openMetric} />

      <DoctorSection id="doctor-stats-clients-section">
        <DoctorSectionTitle>Клиенты</DoctorSectionTitle>
        <p className="text-muted-foreground text-sm">Срез на текущий момент, без привязки к периоду выше.</p>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="order-1 rounded-lg border border-border/60 bg-card p-3 overflow-visible lg:min-h-[260px]">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Каналы связи</p>
            <div className="mt-2 overflow-visible">
              <ClientContactPieChart breakdown={clients.contactBreakdown} onSegmentClick={openContactSegment} />
            </div>
          </div>
          <div className="order-2">
            <DoctorMetricList
              id="doctor-stats-clients-cards"
              className="grid-cols-2 xl:grid-cols-2 2xl:grid-cols-2 max-w-xl"
            >
              <DoctorStatCard
                id="doctor-stats-clients-total"
                title="Всего клиентов"
                value={clients.total}
                onValueClick={() => openMetric("clients_total", "Все клиенты")}
              />
              <DoctorStatCard
                id="doctor-stats-clients-phone-only"
                title="Только телефон"
                value={clients.phoneOnly}
                tone="warning"
                onValueClick={() => openMetric("clients_phone_only", "Клиенты: только телефон")}
              />
              <DoctorStatCard
                id="doctor-stats-clients-app-guests"
                title="Гости приложения"
                value={clients.appGuests}
                tone="warning"
                onValueClick={() => openMetric("clients_app_guests", "Гости приложения")}
              />
            </DoctorMetricList>
          </div>
        </div>
      </DoctorSection>
      <MetricAccountsDialog
        open={metricDialogOpen}
        onOpenChange={setMetricDialogOpen}
        metric={selectedMetric}
        title={selectedMetricTitle}
        period={period}
      />
    </div>
  );
}
