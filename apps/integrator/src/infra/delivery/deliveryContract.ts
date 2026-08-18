import { isRecipientBlockedBotDispatchError } from './recipientBotBlocked.js';

/** Статусы строки `public.outgoing_delivery_queue` (см. миграцию webapp). */
export const OUTGOING_DELIVERY_STATUSES = [
  'pending',
  'processing',
  'sent',
  'failed_retryable',
  'dead',
] as const;

export type OutgoingDeliveryStatus = (typeof OUTGOING_DELIVERY_STATUSES)[number];

export type OutgoingDeliveryKind =
  | 'operator_alert'
  | 'reminder_dispatch'
  | 'doctor_broadcast_intent'
  | 'inbound_reply'
  | 'specialist_task_reminder'
  | 'operator_health_digest'
  | 'appointment_reminder'
  | 'auth_email_otp'
  | 'outbound_message';

/** Kinds whose rows are already complete transport intents and need no product-specific worker logic. */
export const GENERIC_TRANSPORT_QUEUE_KINDS = new Set<string>([
  'specialist_task_reminder',
  'operator_health_digest',
  'appointment_reminder',
  'auth_email_otp',
  // The universal kind (owner ruling 19.08). Every future outbound message is a new `purpose`
  // INSIDE this kind, so no new kind is ever added here again -- that is the whole point: an
  // unrecognised kind is quarantined dead by the scope resolver, and per-kind lists are what made
  // that happen to every login OTP on 04.08.
  'outbound_message',
]);

/**
 * D27-C: durable auth-code email delivery — the person is waiting right now, same class as
 * `inbound_reply`. Kept separate from `INBOUND_REPLY_QUEUE_KIND` (a distinct queue kind, not a
 * second inbound-reply row) but shares its fast retry ladder and short attempt budget.
 */
export const AUTH_EMAIL_OTP_QUEUE_KIND = 'auth_email_otp' as const satisfies OutgoingDeliveryKind;

/**
 * The one universal outbound-message kind (owner ruling 19.08). Message types are `purpose` values
 * inside this kind, not new kinds: `app.enqueue_outbound_message` composes the row, the scope
 * resolver classifies it by `organization_id` before any per-kind branch, and the worker treats it
 * as a complete transport intent.
 */
export const OUTBOUND_MESSAGE_QUEUE_KIND =
  'outbound_message' as const satisfies OutgoingDeliveryKind;

export const DOCTOR_BROADCAST_INTENT_QUEUE_KIND =
  'doctor_broadcast_intent' as const satisfies OutgoingDeliveryKind;

/**
 * D35: ответ на входящее сообщение/нажатие (в т.ч. служебный — «вопрос принят», «тип не
 * поддерживается»). Человек ждёт прямо сейчас, поэтому у этого вида своя короткая лестница
 * (`INBOUND_REPLY_RETRY_BACKOFF_SEC`), а не общая `RETRY_BACKOFF_SEC` рассылок/напоминаний.
 */
export const INBOUND_REPLY_QUEUE_KIND = 'inbound_reply' as const satisfies OutgoingDeliveryKind;

export const DEFAULT_REMINDER_DELIVERY_MAX_ATTEMPTS = 6;

export const OPERATOR_ALERT_DELIVERY_MAX_ATTEMPTS = 10;

/**
 * D35: короткий предел попыток для ответа на входящее. Три ретрая после первой синхронной
 * попытки — см. обоснование чисел у `INBOUND_REPLY_RETRY_BACKOFF_SEC`.
 */
export const INBOUND_REPLY_DELIVERY_MAX_ATTEMPTS = 4;

/** После N-й неудачной попытки доставки — задержка перед следующей (секунды). */
const RETRY_BACKOFF_SEC: readonly number[] = [60, 300, 900, 3600];

/**
 * D35: лестница для `inbound_reply` — «уложиться в минуты, а не в часы» (бриф D35, п.3).
 * Практика (D20_FORKS_RESEARCH.md §1) не даёт точных чисел для интерактивного ответа: Sidekiq/
 * Stripe/SQS ретраят фоновые задания сутками, потому что получатель — сервер, которому всё равно,
 * когда пришло событие. Здесь получатель — человек, который ждёт секунды. Числа ниже — минимально
 * разумные при отсутствии точной цифры в практике (как и требует бриф): несколько коротких попыток
 * на случай сетевой заминки, суммарно ~4 минуты худшего случая до `dead`, — на порядок короче
 * первого шага общей лестницы (60 c), не говоря о часовом хвосте.
 */
const INBOUND_REPLY_RETRY_BACKOFF_SEC: readonly number[] = [15, 60, 180];

/** Kinds where a human is waiting right now — short ladder instead of the hours-long mailing tail. */
const FAST_RETRY_QUEUE_KINDS = new Set<string>([INBOUND_REPLY_QUEUE_KIND, AUTH_EMAIL_OTP_QUEUE_KIND]);

function retryBackoffLadderForKind(kind: string | undefined): readonly number[] {
  return kind !== undefined && FAST_RETRY_QUEUE_KINDS.has(kind)
    ? INBOUND_REPLY_RETRY_BACKOFF_SEC
    : RETRY_BACKOFF_SEC;
}

/**
 * @param failedAttemptNumber — номер завершившейся неудачной попытки (1-based).
 * @param kind — вид строки очереди; влияет только на выбор лестницы (см. `retryBackoffLadderForKind`).
 *   Без указания или для любого вида кроме `FAST_RETRY_QUEUE_KINDS` (`inbound_reply`,
 *   `auth_email_otp`) — прежняя общая лестница, поведение напоминаний/рассылок/операторских
 *   алертов не меняется.
 */
export function retryDelaySecondsAfterFailure(failedAttemptNumber: number, kind?: string): number {
  const ladder = retryBackoffLadderForKind(kind);
  if (!Number.isFinite(failedAttemptNumber) || failedAttemptNumber < 1) {
    return ladder[0]!;
  }
  const idx = Math.min(failedAttemptNumber - 1, ladder.length - 1);
  return ladder[idx]!;
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
  if (isRecipientBlockedBotDispatchError(m)) return false;
  if (m.startsWith('CHANNEL_NOT_SPECIFIED')) return false;
  if (m.startsWith('CHANNEL_NOT_SUPPORTED:')) return false;
  if (m.startsWith('PLATFORM_INTEGRATION_DISABLED:')) return false;
  if (m.startsWith('BAD_PAYLOAD')) return false;
  if (m.startsWith('MISSING_INCIDENT_ID')) return false;
  if (m.startsWith('MISSING_REMINDER_FIELDS')) return false;
  if (m.startsWith('MISSING_BROADCAST_AUDIT_ID')) return false;
  if (m.startsWith('UNKNOWN_KIND:')) return false;
  return true;
}
