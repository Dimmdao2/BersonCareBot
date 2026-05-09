/**
 * После успешной отметки разминки дня (`source: daily_warmup`) на главной в Hero
 * вместо CTA «Начать разминку» показываем статус «Разминка выполнена» (бледно-зелёный),
 * чтобы не подталкивать к повторному прохождению сразу после выполнения.
 */
export const PATIENT_HOME_DAILY_WARMUP_HERO_COOLDOWN_MINUTES = 20;

function ruMinutesAccusativeForThrough(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return "минут";
  if (mod10 === 1) return "минуту";
  if (mod10 >= 2 && mod10 <= 4) return "минуты";
  return "минут";
}

/**
 * Подпись под «Разминка выполнена»: через сколько снова доступна разминка.
 */
export function formatPatientHomeWarmupCooldownCaption(minutesRemaining: number): string {
  const through = `${minutesRemaining} ${ruMinutesAccusativeForThrough(minutesRemaining)}`;
  return `Разминка будет доступна через ${through}.`;
}
