/**
 * Форматирование UTC-даты YYYY-MM-DD для подписей в таблицах дневника (без React).
 */
export function formatDiaryDayShortRu(isoDay: string): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  if (!y || !m || !d) return isoDay;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
}
