import type { ExerciseLoadType } from "./types";
import { EXERCISE_LOAD_TYPE_SEED_V1 } from "./exerciseLoadTypeReference";

/** @deprecated Используйте справочник `load_type` / {@link EXERCISE_LOAD_TYPE_SEED_V1}. Оставлено для обратной совместимости импортов. */
export const EXERCISE_LOAD_TYPE_OPTIONS: readonly { value: ExerciseLoadType; label: string }[] =
  EXERCISE_LOAD_TYPE_SEED_V1.map((x) => ({ value: x.code, label: x.title }));

export function exerciseLoadTypeLabel(code: ExerciseLoadType | null | undefined | ""): string {
  if (!code) return "";
  const hit = EXERCISE_LOAD_TYPE_SEED_V1.find((o) => o.code === code);
  return hit?.title ?? String(code);
}
