/**
 * Логика совпадает с SQL в `pgDoctorAppointments` (`CANCELLATION_LAST_EVENT_EXCLUSION_SQL`).
 */
const CANCELLATION_EXCLUDED_LAST_EVENTS = new Set(["event-remove-record", "event-delete-record"]);

export type AppointmentHistoryRowForStats = {
  status: string;
  lastEvent: string;
  updatedAt: string;
  recordAt: string | null;
  label: string;
};

export function isCountedCancellation(status: string, lastEvent: string): boolean {
  if (status !== "canceled") return false;
  if (CANCELLATION_EXCLUDED_LAST_EVENTS.has(lastEvent)) return false;
  return true;
}

/** Отмены за последние 30 дней по `updatedAt` (как `updated_at` в SQL). */
export function countCancellations30d(items: AppointmentHistoryRowForStats[], nowMs: number): number {
  const cutoff = nowMs - 30 * 24 * 60 * 60 * 1000;
  let n = 0;
  for (const it of items) {
    if (!isCountedCancellation(it.status, it.lastEvent)) continue;
    const t = Date.parse(it.updatedAt);
    if (Number.isNaN(t) || t < cutoff) continue;
    n++;
  }
  return n;
}

/** Последний прошедший визит по `recordAt` (строго до `now`). */
export function lastVisitLabelFromHistory(items: AppointmentHistoryRowForStats[], nowMs: number): string | null {
  let best: { t: number; label: string } | null = null;
  for (const it of items) {
    if (!it.recordAt) continue;
    const t = Date.parse(it.recordAt);
    if (Number.isNaN(t) || t >= nowMs) continue;
    if (!best || t > best.t) best = { t, label: it.label };
  }
  return best?.label ?? null;
}
