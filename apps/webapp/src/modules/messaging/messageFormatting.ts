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
