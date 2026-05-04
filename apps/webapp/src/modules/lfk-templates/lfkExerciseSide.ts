/** Сторона / сторона относительно травмы для строки упражнения в шаблоне и комплексе ЛФК. */
export type LfkExerciseSide = "left" | "right" | "both" | "damaged" | "healthy";

export function parseLfkExerciseSide(raw: string): LfkExerciseSide | null {
  if (raw === "left" || raw === "right" || raw === "both" || raw === "damaged" || raw === "healthy") {
    return raw;
  }
  return null;
}

export function lfkExerciseSideRu(side: LfkExerciseSide | null | undefined): string | null {
  if (side == null) return null;
  switch (side) {
    case "left":
      return "Левая";
    case "right":
      return "Правая";
    case "both":
      return "Обе";
    case "damaged":
      return "Повреждённая";
    case "healthy":
      return "Здоровая";
    default:
      return null;
  }
}

/** Порядок опций в селекте редактора шаблона. */
export const LFK_EXERCISE_SIDE_SELECT_OPTIONS: readonly { value: LfkExerciseSide; label: string }[] = [
  { value: "left", label: "Левая" },
  { value: "right", label: "Правая" },
  { value: "both", label: "Обе" },
  { value: "damaged", label: "Повреждённая" },
  { value: "healthy", label: "Здоровая" },
] as const;
