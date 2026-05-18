/**
 * Группировка сообщений по календарным дням и подписи для UI чата.
 */

export function dayKeyFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "invalid";
  return d.toISOString().slice(0, 10);
}

/** Подпись разделителя дня (локаль ru). */
export function formatChatDayLabelRu(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
}

const MONTH_GENITIVE_RU = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
] as const;

function ymdLocal(d: Date): { year: number; month: number; day: number } {
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
}

/** Только календарная дата (локаль браузера), без времени — для подписей «сегодня» / «вчера». */
export function formatChatRelativeDateLabelRu(iso: string, referenceDate: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const m = ymdLocal(d);
  const r = ymdLocal(referenceDate);
  const sameCalendarDay =
    m.year === r.year && m.month === r.month && m.day === r.day;
  if (sameCalendarDay) return "сегодня";

  const yRef = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  yRef.setDate(yRef.getDate() - 1);
  const y = ymdLocal(yRef);
  if (m.year === y.year && m.month === y.month && m.day === y.day) return "вчера";

  const dayNum = d.getDate();
  const monthLabel = MONTH_GENITIVE_RU[d.getMonth()] ?? "";
  if (m.year === r.year) {
    return `${dayNum} ${monthLabel}`;
  }
  return `${dayNum} ${monthLabel} ${m.year}`;
}

/** Время сообщения HH:MM (локаль ru). */
export function formatChatMessageTimeRu(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function groupMessagesByDay<T extends { createdAt: string }>(
  messages: T[]
): { dayKey: string; dayLabel: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const m of messages) {
    const k = dayKeyFromIso(m.createdAt);
    if (k === "invalid") continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(m);
  }
  const keys = [...map.keys()].sort();
  return keys.map((k) => {
    const items = map.get(k)!;
    const first = items[0];
    return {
      dayKey: k,
      dayLabel: first ? formatChatDayLabelRu(first.createdAt) : k,
      items,
    };
  });
}
