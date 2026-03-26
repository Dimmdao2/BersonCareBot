/**
 * Подписи оси X графиков дневника (EXEC I.8): неделя / месяц / «всё».
 */
import type { StatsPeriod } from "./periodWindow";
import { formatDiaryDayShortRu } from "./formatDiaryDay";

function ruWeekdayShortUpper(isoDay: string): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  if (!y || !m || !d) return isoDay;
  const raw = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("ru-RU", { weekday: "short" });
  const t = raw.replace(/\.$/, "").trim();
  return t.slice(0, 2).toUpperCase();
}

function ruMonthShort(isoDay: string): string {
  const [y, m] = isoDay.split("-").map(Number);
  if (!y || !m) return isoDay;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("ru-RU", { month: "short" }).replace(/\.$/, "");
}

/** Показывать подпись для точки с индексом `index` (отсортированные по дате). */
export function diaryChartShowTick(
  period: StatsPeriod,
  index: number,
  total: number,
  currentDay: string,
  prevDay: string | null
): boolean {
  if (total === 0) return false;
  if (period === "week") return true;
  if (period === "month") {
    if (index === 0 || index === total - 1) return true;
    const [y, m, d] = currentDay.split("-").map(Number);
    if (!y || !m || !d) return false;
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return wd === 1;
  }
  if (index === 0) return true;
  if (!prevDay) return true;
  return currentDay.slice(0, 7) !== prevDay.slice(0, 7);
}

export function diaryChartFormatTickLabel(isoDay: string, period: StatsPeriod): string {
  if (period === "week") return ruWeekdayShortUpper(isoDay);
  if (period === "month") return formatDiaryDayShortRu(isoDay);
  return ruMonthShort(isoDay);
}
