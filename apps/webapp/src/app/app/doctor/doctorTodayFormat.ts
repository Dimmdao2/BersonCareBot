/**
 * Общие форматтеры дашборда «Сегодня» и связанных агрегатных экранов кабинета врача.
 * Выделены из `loadDoctorTodayDashboard.ts`, чтобы переиспользовать в извлечённых загрузчиках
 * без циклических импортов (см. `loadDoctorExerciseCommentAttention.ts`).
 */

import { DEFAULT_APP_DISPLAY_TIMEZONE } from '@/modules/system-settings/calendarIana';

const TEXT_PREVIEW_MAX = 160;

export function truncateText(
  text: string | null | undefined,
  max = TEXT_PREVIEW_MAX,
): string | null {
  if (text == null || text === '') return null;
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function formatDateTimeRu(iso: string, timeZone = DEFAULT_APP_DISPLAY_TIMEZONE): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone });
}

export function formatCommentDateRu(
  iso: string,
  timeZone = DEFAULT_APP_DISPLAY_TIMEZONE,
  now = new Date(),
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const dateParts = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    timeZone,
  }).formatToParts(date);
  const nowParts = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    timeZone,
  }).formatToParts(now);
  const value = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const day = value(dateParts, 'day');
  const month = value(dateParts, 'month');
  const year = value(dateParts, 'year');
  const currentDay = value(nowParts, 'day');
  const currentMonth = value(nowParts, 'month');
  const currentYear = value(nowParts, 'year');
  if (!day || !month || !year || !currentDay || !currentMonth || !currentYear) return iso;

  const dayDistance =
    (Date.UTC(currentYear, currentMonth - 1, currentDay) - Date.UTC(year, month - 1, day)) /
    86_400_000;
  const timeParts = new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).formatToParts(date);
  const hour = timeParts.find((part) => part.type === 'hour')?.value;
  const minute = timeParts.find((part) => part.type === 'minute')?.value;
  if (!hour || !minute) return iso;

  if (dayDistance === 0) return `сегодня ${hour}:${minute}`;
  if (dayDistance === 1) return `вчера ${hour}:${minute}`;

  const monthLabels = [
    'янв',
    'фев',
    'мар',
    'апр',
    'мая',
    'июн',
    'июл',
    'авг',
    'сент',
    'окт',
    'нояб',
    'дек',
  ] as const;
  const monthLabel = monthLabels[month - 1];
  if (!monthLabel) return iso;
  return `${day} ${monthLabel}${year === currentYear ? '' : ` ${year}`} ${hour}:${minute}`;
}
