import { createHash } from "node:crypto";

/** Ключ календарного дня UTC для выбора цитаты (тестируемая детерминированность). */
export function quoteDayKeyUtc(referenceDate: Date): string {
  return referenceDate.toISOString().slice(0, 10);
}

/** Индекс цитаты для пары (seed, день); совпадает с логикой выбора в порте legacy-контента. */
export function quoteIndexForDaySeed(daySeed: string, dayKey: string, total: number): number {
  if (total <= 0) return 0;
  const h = createHash("sha256").update(`${daySeed}:${dayKey}`).digest();
  return h.readUInt32BE(0) % total;
}
