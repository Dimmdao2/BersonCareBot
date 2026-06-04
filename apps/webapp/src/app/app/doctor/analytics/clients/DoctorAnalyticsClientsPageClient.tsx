"use client";

import { useCallback, useMemo, useState } from "react";

import type { ClientContactBreakdown } from "@/modules/doctor-clients/clientContactSegments";
import type { AdminStatsTimePreset } from "@/modules/admin-platform-stats/types";
import { DoctorMetricList } from "@/shared/ui/doctor/DoctorMetricList";
import { DoctorSection, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";

import { AdminPlatformRegistrationStatsClient } from "./AdminPlatformRegistrationStatsClient";
import { AdminPlatformSubscriberStatsClient } from "./AdminPlatformSubscriberStatsClient";
import { AnalyticsPeriodToolbar } from "./AnalyticsPeriodToolbar";
import { ClientContactPieChart } from "./ClientContactPieChart";
import { DoctorAnalyticsAppointmentsSection } from "./DoctorAnalyticsAppointmentsSection";
import { DoctorStatCard } from "./DoctorStatCard";
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
        <AdminPlatformSubscriberStatsClient period={period} ready={periodReady} />
        <AdminPlatformRegistrationStatsClient period={period} ready={periodReady} />
      </div>

      <DoctorAnalyticsAppointmentsSection period={period} ready={periodReady} />

      <DoctorSection id="doctor-stats-clients-section">
        <DoctorSectionTitle>Клиенты</DoctorSectionTitle>
        <p className="text-muted-foreground text-sm">Срез на текущий момент, без привязки к периоду выше.</p>
        <DoctorMetricList id="doctor-stats-clients-cards">
          <DoctorStatCard id="doctor-stats-clients-total" title="Всего клиентов" value={clients.total} />
          <DoctorStatCard
            id="doctor-stats-clients-phone-only"
            title="Только телефон"
            value={clients.phoneOnly}
            tone="warning"
          />
          <DoctorStatCard
            id="doctor-stats-clients-app-guests"
            title="Гости приложения"
            value={clients.appGuests}
            tone="warning"
          />
        </DoctorMetricList>
        <div className="mt-3 w-full shrink-0 lg:w-1/3 lg:max-w-xs">
          <div className="rounded-lg border border-border/60 bg-card p-3 overflow-visible">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Каналы связи</p>
            <div className="mt-2 overflow-visible">
              <ClientContactPieChart breakdown={clients.contactBreakdown} />
            </div>
          </div>
        </div>
      </DoctorSection>
    </div>
  );
}
