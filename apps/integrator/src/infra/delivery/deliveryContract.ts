/** Статусы строки `public.outgoing_delivery_queue` (см. миграцию webapp). */
export const OUTGOING_DELIVERY_STATUSES = [
  "pending",
  "processing",
  "sent",
  "failed_retryable",
  "dead",
] as const;

export type OutgoingDeliveryStatus = (typeof OUTGOING_DELIVERY_STATUSES)[number];

export type OutgoingDeliveryKind = "operator_alert" | "reminder_dispatch" | "doctor_broadcast_intent";

export const DOCTOR_BROADCAST_INTENT_QUEUE_KIND = "doctor_broadcast_intent" as const satisfies OutgoingDeliveryKind;

export const DEFAULT_REMINDER_DELIVERY_MAX_ATTEMPTS = 6;

export const OPERATOR_ALERT_DELIVERY_MAX_ATTEMPTS = 10;

/** После N-й неудачной попытки доставки — задержка перед следующей (секунды). */
const RETRY_BACKOFF_SEC: readonly number[] = [60, 300, 900, 3600];

/**
 * @param failedAttemptNumber — номер завершившейся неудачной попытки (1-based).
 */
export function retryDelaySecondsAfterFailure(failedAttemptNumber: number): number {
  if (!Number.isFinite(failedAttemptNumber) || failedAttemptNumber < 1) {
    return RETRY_BACKOFF_SEC[0]!;
  }
  const idx = Math.min(failedAttemptNumber - 1, RETRY_BACKOFF_SEC.length - 1);
  return RETRY_BACKOFF_SEC[idx]!;
}

export function truncateDeliveryErrorMessage(message: string, maxLen = 900): string {
  const t = message.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

/**
 * Ошибки конфигурации/полезной нагрузки — не ретраим бесконечно; сразу в `dead`.
 * Сетевые/временные сбои адаптера — ретраим по backoff до `max_attempts`.
 */
export function isOutgoingDeliveryDispatchErrorRetryable(errorMessage: string): boolean {
  const m = errorMessage.trim();
  if (m.startsWith("CHANNEL_NOT_SPECIFIED")) return false;
  if (m.startsWith("CHANNEL_NOT_SUPPORTED:")) return false;
  if (m.startsWith("BAD_PAYLOAD")) return false;
  if (m.startsWith("MISSING_INCIDENT_ID")) return false;
  if (m.startsWith("MISSING_REMINDER_FIELDS")) return false;
  if (m.startsWith("MISSING_BROADCAST_AUDIT_ID")) return false;
  if (m.startsWith("UNKNOWN_KIND:")) return false;
  return true;
}
