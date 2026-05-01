/** Каналы доставки рассылки (audit UI); активные — те, что можно выбрать сегодня. */

export type BroadcastChannel = "bot_message" | "sms" | "push" | "home_banner" | "notification_bell";

export const BROADCAST_ACTIVE_CHANNELS: readonly BroadcastChannel[] = ["bot_message", "sms"];

export const BROADCAST_PLANNED_CHANNELS: readonly BroadcastChannel[] = [
  "push",
  "home_banner",
  "notification_bell",
];

const ACTIVE_SET = new Set<string>(BROADCAST_ACTIVE_CHANNELS);

/** Нормализация: только активные каналы, уникальные, стабильный порядок. Пустой ввод → оба активных. */
export function normalizeBroadcastChannels(raw: string[] | undefined | null): BroadcastChannel[] {
  const input =
    raw != null && raw.length > 0 ? raw.map((c) => String(c).trim()).filter(Boolean) : [...BROADCAST_ACTIVE_CHANNELS];
  const picked = input.filter((c): c is BroadcastChannel => ACTIVE_SET.has(c));
  const uniq = [...new Set(picked)].sort((a, b) => a.localeCompare(b));
  if (uniq.length === 0) {
    throw new Error("invalid_broadcast_channels");
  }
  return uniq;
}
