/**
 * Каналы доставки рассылки (audit UI); активные — те, что можно выбрать сегодня.
 *
 * История:
 * - `bot_message` — LEGACY: исторически объединял telegram+max в одном канале;
 *   по-прежнему допустим во входных данных (нормализуется → telegram+max),
 *   отображается в журнале как «Сообщение в боте», но НЕ предлагается как новый активный выбор.
 * - `telegram`, `max`, `email` — добавлены в этапе 4a (2026-06-13).
 */

export type BroadcastChannel =
  | "bot_message"
  | "sms"
  | "push"
  | "telegram"
  | "max"
  | "email"
  | "home_banner"
  | "notification_bell";

/**
 * Активные каналы, предлагаемые в форме рассылки.
 * Дефолт при отправке: telegram + max + push.
 * `bot_message` — legacy, НЕ в этом списке.
 */
export const BROADCAST_ACTIVE_CHANNELS: readonly BroadcastChannel[] = [
  "telegram",
  "max",
  "push",
  "sms",
  "email",
];

/** Дефолтные каналы при новой рассылке (Telegram + MAX + Push). */
export const BROADCAST_DEFAULT_CHANNELS: readonly BroadcastChannel[] = ["telegram", "max", "push"];

export const BROADCAST_PLANNED_CHANNELS: readonly BroadcastChannel[] = ["home_banner", "notification_bell"];

const ACTIVE_SET = new Set<string>(BROADCAST_ACTIVE_CHANNELS);

/**
 * Нормализация каналов:
 * - Пустой ввод → дефолтные каналы (telegram + max + push).
 * - Legacy `bot_message` → раскладывается в telegram + max.
 * - Возвращает уникальные активные каналы в стабильном порядке.
 */
export function normalizeBroadcastChannels(raw: string[] | undefined | null): BroadcastChannel[] {
  const hasInput = raw != null && raw.length > 0;
  const input = hasInput ? raw.map((c) => String(c).trim()).filter(Boolean) : [...BROADCAST_DEFAULT_CHANNELS];

  // Раскрываем legacy bot_message → telegram + max
  const expanded: string[] = [];
  for (const c of input) {
    if (c === "bot_message") {
      expanded.push("telegram", "max");
    } else {
      expanded.push(c);
    }
  }

  const picked = expanded.filter((c): c is BroadcastChannel => ACTIVE_SET.has(c));
  const uniq = [...new Set(picked)].sort((a, b) => a.localeCompare(b));
  if (uniq.length === 0) {
    throw new Error("invalid_broadcast_channels");
  }
  return uniq;
}
