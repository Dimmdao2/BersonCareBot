/**
 * Общие форматтеры дашборда «Сегодня» и связанных агрегатных экранов кабинета врача.
 * Выделены из `loadDoctorTodayDashboard.ts`, чтобы переиспользовать в извлечённых загрузчиках
 * без циклических импортов (см. `loadDoctorExerciseCommentAttention.ts`).
 */

const TEXT_PREVIEW_MAX = 160;

export function truncateText(text: string | null | undefined, max = TEXT_PREVIEW_MAX): string | null {
  if (text == null || text === "") return null;
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function formatDateTimeRu(iso: string, timeZone = "Europe/Moscow"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone });
}
