import { statsPeriodWindowUtc, type StatsPeriod } from "@/modules/diaries/stats/periodWindow";

export function parseStatsPeriod(raw: string | undefined): StatsPeriod {
  if (raw === "week" || raw === "month" || raw === "all") return raw;
  return "week";
}

export function parseOffset(raw: string | undefined): number {
  const n = Number.parseInt(String(raw ?? "0"), 10);
  if (Number.isNaN(n) || n < 0) return 0;
  return Math.min(520, n);
}

/**
 * Месяц журнала YYYY-MM: из query `month` или из окна статистики (period/offset/earliest).
 */
export function resolveJournalMonthYm(params: {
  monthParam: string | undefined;
  period: StatsPeriod;
  offset: number;
  earliestIso: string | null;
}): string {
  const m = params.monthParam?.trim();
  if (m && /^\d{4}-\d{2}$/.test(m)) return m;
  const { toExclusiveIso } = statsPeriodWindowUtc(params.period, params.offset, {
    earliestIso: params.earliestIso,
  });
  const end = new Date(toExclusiveIso);
  end.setUTCMilliseconds(end.getUTCMilliseconds() - 1);
  return `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function utcMonthRangeIso(monthYm: string): { fromIso: string; toExclusiveIso: string } {
  const [y, m] = monthYm.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) {
    const now = new Date();
    return utcMonthRangeIso(
      `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`
    );
  }
  const fromIso = `${y}-${String(m).padStart(2, "0")}-01T00:00:00.000Z`;
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  const toExclusiveIso = `${nextY}-${String(nextM).padStart(2, "0")}-01T00:00:00.000Z`;
  return { fromIso, toExclusiveIso };
}
