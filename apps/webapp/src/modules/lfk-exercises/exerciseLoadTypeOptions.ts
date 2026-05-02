import type { ExerciseLoadType } from "./types";

/** Единый список кодов и подписей для фильтров, форм и отображения в UI. */
export const EXERCISE_LOAD_TYPE_OPTIONS: readonly { value: ExerciseLoadType; label: string }[] = [
  { value: "strength", label: "Силовая" },
  { value: "stretch", label: "Растяжка" },
  { value: "balance", label: "Баланс" },
  { value: "cardio", label: "Кардио" },
  { value: "other", label: "Другое" },
] as const;

export function exerciseLoadTypeLabel(code: ExerciseLoadType | null | undefined | ""): string {
  if (!code) return "";
  const hit = EXERCISE_LOAD_TYPE_OPTIONS.find((o) => o.value === code);
  return hit?.label ?? String(code);
}
