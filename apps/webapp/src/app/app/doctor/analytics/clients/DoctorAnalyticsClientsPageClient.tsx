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
  patientsCount: number;
  subscribersOnlyCount: number;
  contactBreakdown: ClientContactBreakdown;
};

/** Срез «сейчас» — список клиентов не зависит от периода в тулбаре. */
const CLIENT_SNAPSHOT_METRICS = new Set<DoctorAnalyticsMetricKey>([
  "clients_total",
  "clients_phone_only",
  "clients_app_guests",
  "clients_segment_telegram_only",
  "clients_segment_max_only",
  "clients_segment_email_only",
  "clients_segment_telegram_email",
  "clients_segment_max_email",
  "clients_segment_phone_email_no_messenger",
  "clients_messenger_bot_blocked_telegram",
  "clients_messenger_bot_blocked_max",
]);

type Props = {
  calendarTodayYmd: string;
  displayIana: string;
  clients: ClientsSnapshot;
  patientPluralLabel?: string;
  patientGenPlural?: string;
};

export function DoctorAnalyticsClientsPageClient({ calendarTodayYmd, displayIana, clients, patientPluralLabel = "Клиенты", patientGenPlural = "клиентов" }: Props) {
  const [preset, setPreset] = useState<AdminStatsTimePreset>("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [appliedPeriod, setAppliedPeriod] = useState<AnalyticsPeriodValue>({
    preset: "week",
    customFrom: "",
    customTo: "",
  });
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
    () => resolveAnalyticsPeriodLabel(displayIana, appliedPeriod),
    [displayIana, appliedPeriod],
  );

  const metricDialogPeriod = useMemo(
    () => (selectedMetric && CLIENT_SNAPSHOT_METRICS.has(selectedMetric) ? undefined : appliedPeriod),
    [selectedMetric, appliedPeriod],
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
      setAppliedPeriod(next);
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

  const handleCustomFromChange = useCallback((value: string) => {
    setCustomFrom(value);
    setPeriodError(null);
  }, []);

  const handleCustomToChange = useCallback((value: string) => {
    setCustomTo(value);
    setPeriodError(null);
  }, []);

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
        onCustomFromChange={handleCustomFromChange}
        onCustomToChange={handleCustomToChange}
        onApplyCustom={handleApplyCustom}
      />

      <AdminPlatformSubscriberStatsClient period={appliedPeriod} ready={periodReady} onMetricClick={openMetric} />

      <DoctorSection id="doctor-stats-clients-section">
        <DoctorSectionTitle>{patientPluralLabel}</DoctorSectionTitle>
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
                id="doctor-stats-clients-patients"
                title={patientPluralLabel}
                value={clients.patientsCount}
                onClick={() => openMetric("clients_total", `${patientPluralLabel} (с записями)`)}
              />
              <DoctorStatCard
                id="doctor-stats-clients-potential"
                title="Потенциальных"
                value={clients.subscribersOnlyCount}
                onClick={() => openMetric("clients_total", "Потенциальные (без записей)")}
              />
              <DoctorStatCard
                id="doctor-stats-clients-total"
                title={`Всего ${patientGenPlural}`}
                value={clients.total}
                onClick={() => openMetric("clients_total", `Все ${patientGenPlural}`)}
              />
              <DoctorStatCard
                id="doctor-stats-clients-phone-only"
                title="Только телефон"
                value={clients.phoneOnly}
                tone="warning"
                onClick={() => openMetric("clients_phone_only", `${patientPluralLabel}: только телефон`)}
              />
              <DoctorStatCard
                id="doctor-stats-clients-app-guests"
                title="Гости приложения"
                value={clients.appGuests}
                tone="warning"
                onClick={() => openMetric("clients_app_guests", "Гости приложения")}
              />
              <DoctorStatCard
                id="doctor-stats-clients-bot-blocked-telegram"
                title="ТГ: бот заблокирован"
                value={clients.contactBreakdown.messengerBotBlocked.telegram}
                onClick={() =>
                  openMetric("clients_messenger_bot_blocked_telegram", "Telegram: бот заблокирован")
                }
              />
              <DoctorStatCard
                id="doctor-stats-clients-bot-blocked-max"
                title="MAX: бот заблокирован"
                value={clients.contactBreakdown.messengerBotBlocked.max}
                onClick={() => openMetric("clients_messenger_bot_blocked_max", "MAX: бот заблокирован")}
              />
            </DoctorMetricList>
          </div>
        </div>
      </DoctorSection>

      <DoctorAnalyticsAppointmentsSection period={appliedPeriod} ready={periodReady} onMetricClick={openMetric} patientGenPlural={patientGenPlural} />

      <MetricAccountsDialog
        open={metricDialogOpen}
        onOpenChange={setMetricDialogOpen}
        metric={selectedMetric}
        title={selectedMetricTitle}
        period={metricDialogPeriod}
      />
    </div>
  );
}
