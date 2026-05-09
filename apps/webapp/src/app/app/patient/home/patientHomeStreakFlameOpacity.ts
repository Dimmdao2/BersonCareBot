/**
 * Непрозрачность иконки «огонька» серии на главной: чем длиннее серия дней с практиками без пропусков,
 * тем ярче (выше opacity). При 0 дней — минимальная яркость (полупрозрачный силуэт).
 */
export function streakFlameOpacity(streakDays: number): number {
  const min = 0.26;
  const max = 1;
  const cap = 14;
  const n = Math.max(0, Math.floor(streakDays));
  if (n <= 0) return min;
  const t = Math.min(1, n / cap);
  return min + (max - min) * t;
}
