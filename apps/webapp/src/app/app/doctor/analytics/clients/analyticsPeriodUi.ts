import {
  MIN_REGISTRATION_STATS_INCLUSIVE_DAYS,
  resolveAdminStatsLocalRange,
} from "@/modules/admin-platform-stats/registrationTimeRange";
import type { AdminStatsTimePreset } from "@/modules/admin-platform-stats/types";

export type AnalyticsPeriodValue = {
  preset: AdminStatsTimePreset;
  customFrom: string;
  customTo: string;
};

export function ymdMinusDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map((x) => Number.parseInt(x, 10));
  const dt = new Date(y!, m! - 1, d!);
  dt.setDate(dt.getDate() - days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function inclusiveCalendarDays(fromYmd: string, toYmd: string): number {
  const [yf, mf, df] = fromYmd.split("-").map((x) => Number.parseInt(x, 10));
  const [yt, mt, dt] = toYmd.split("-").map((x) => Number.parseInt(x, 10));
  const a = new Date(yf!, mf! - 1, df!);
  const b = new Date(yt!, mt! - 1, dt!);
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

export function formatAnalyticsPeriodLabel(fromDay: string, toDay: string): string {
  return fromDay === toDay ? `День ${fromDay}` : `Период ${fromDay} — ${toDay}`;
}

export function resolveAnalyticsPeriodLabel(
  displayIana: string,
  period: AnalyticsPeriodValue,
): string | null {
  try {
    const resolved = resolveAdminStatsLocalRange(
      displayIana,
      period.preset,
      period.customFrom,
      period.customTo,
      period.preset === "custom" ? { enforceMinInclusiveDays: MIN_REGISTRATION_STATS_INCLUSIVE_DAYS } : undefined,
    );
    return formatAnalyticsPeriodLabel(resolved.fromDay, resolved.toDay);
  } catch {
    return null;
  }
}

export function validateCustomAnalyticsPeriod(period: AnalyticsPeriodValue): string | null {
  if (period.preset !== "custom") return null;
  const from = period.customFrom.trim();
  const to = period.customTo.trim();
  if (!from || !to) return "Укажите даты периода.";
  if (inclusiveCalendarDays(from, to) < MIN_REGISTRATION_STATS_INCLUSIVE_DAYS) {
    return "Период не короче 7 дней.";
  }
  return null;
}

export function buildAdminStatsQuery(period: AnalyticsPeriodValue): string {
  const p = new URLSearchParams();
  p.set("preset", period.preset);
  if (period.preset === "custom") {
    p.set("from", period.customFrom.trim());
    p.set("to", period.customTo.trim());
  }
  return p.toString();
}
