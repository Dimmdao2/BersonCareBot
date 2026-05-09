/**
 * Палитра самочувствия для недельного графика — те же RGB, что Tailwind у иконок на главной
 * (`PatientHomeMoodCheckin` → MOOD_SCORE_ICON_CLASS: red-600 / orange-600 / amber-500 / lime-600 / green-600).
 *
 * Значение самочувствия хранится как **1–5** (`value_0_10` у `general_wellbeing`). Среднее за день может быть дробным;
 * **цвет совпадает с иконкой целой оценки**: берём ближайшее целое в [1, 5] (как `Math.round` после clamp),
 * без плавного градиента между «оранжевым 2» и «жёлтым 3» — иначе 2.7 выглядит как тёмно-оранжевый, хотя ближе к «тройке».
 */

const MOOD_SCORE_RGB: Record<1 | 2 | 3 | 4 | 5, readonly [number, number, number]> = {
  1: [220, 38, 38], // red-600
  2: [234, 88, 12], // orange-600
  3: [245, 158, 11], // amber-500
  4: [101, 163, 13], // lime-600
  5: [22, 163, 74], // green-600
} as const;

/** Числовая отметка (1–5, иногда дробное среднее) → RGB ровно того же «ступенчатого» цвета, что у иконки с этой оценкой. */
export function wellbeingValue10ToRgb(v: number): string {
  const clamped = Math.max(1, Math.min(5, v));
  const bucket = Math.round(clamped) as 1 | 2 | 3 | 4 | 5;
  const [r, g, b] = MOOD_SCORE_RGB[bucket];
  return `rgb(${r},${g},${b})`;
}
