import type { TemplateExerciseInput } from "@/modules/lfk-templates/types";

/** Строки редактора → payload для `updateExercises` (sort_order = индекс). */
export function editorLinesToTemplateExerciseInputs(
  lines: {
    exerciseId: string;
    reps: number | null;
    sets: number | null;
    side: "left" | "right" | "both" | null;
    maxPain0_10: number | null;
    comment: string | null;
  }[]
): TemplateExerciseInput[] {
  return lines.map((line, idx) => ({
    exerciseId: line.exerciseId,
    sortOrder: idx,
    reps: line.reps,
    sets: line.sets,
    side: line.side,
    maxPain0_10: line.maxPain0_10,
    comment: line.comment,
  }));
}
