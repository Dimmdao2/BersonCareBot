/** Повторная отметка «Выполнено» у простого пункта плана — клиентский freeze; длительность из `system_settings` (минуты). */

export function planItemDoneRepeatCooldownMsFromMinutes(minutes: number): number {
  const m = Math.round(Number(minutes));
  if (!Number.isFinite(m) || m < 1) return 60 * 60_000;
  return Math.max(1, m) * 60_000;
}

function ruMinutesAccusativeForThrough(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return "минут";
  if (mod10 === 1) return "минуту";
  if (mod10 >= 2 && mod10 <= 4) return "минуты";
  return "минут";
}

/** `null` если cooldown не активен или нет валидной метки времени. */
export function itemDoneCooldownMinutesRemaining(
  lastDoneAtIso: string | null | undefined,
  cooldownMs: number,
  nowMs: number = Date.now(),
): number | null {
  if (!lastDoneAtIso?.trim()) return null;
  const t = Date.parse(lastDoneAtIso.trim());
  if (!Number.isFinite(t)) return null;
  const elapsed = nowMs - t;
  if (elapsed < 0 || elapsed >= cooldownMs) return null;
  const remMs = cooldownMs - elapsed;
  return Math.max(1, Math.ceil(remMs / 60_000));
}

export function isItemDoneCooldownActive(
  lastDoneAtIso: string | null | undefined,
  cooldownMs: number,
  nowMs: number = Date.now(),
): boolean {
  return itemDoneCooldownMinutesRemaining(lastDoneAtIso, cooldownMs, nowMs) !== null;
}

/** Подпись под «Выполнено» на пункте плана (аналогично подписи cooldown разминки на главной). */
export function formatPlanItemDoneCooldownCaption(minutesRemaining: number): string {
  const through = `${minutesRemaining} ${ruMinutesAccusativeForThrough(minutesRemaining)}`;
  return `Снова через ${through}.`;
}
